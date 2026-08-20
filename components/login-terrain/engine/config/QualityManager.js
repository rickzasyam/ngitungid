/**
 * QualityManager — owns device-quality tiers and the render-resolution policy.
 *
 * Purpose:          One place that decides how much GPU work this device gets:
 *                   pixel-ratio cap, render scale, particle budget.
 * Responsibilities: Tier definition, static device detection, effective
 *                   pixel-ratio computation. Consumers never read
 *                   `devicePixelRatio` directly.
 * Dependencies:     Browser `navigator` / `matchMedia` only.
 * Performance:      Detection runs once at construction; `effectivePixelRatio`
 *                   is a trivial getter safe to call on every resize.
 *
 * Rollout plan (per approved roadmap):
 * - M0: tier table, static detection, pixel-ratio / render-scale policy (live).
 * - M2: `particleBudget` consumed by the GPU particle engine.
 * - M5: runtime FPS watchdog (`watch`) that scales render resolution DOWN only.
 *
 * The watchdog adjusts render RESOLUTION (a live, allocation-free knob) rather
 * than particle count (which would require a full geometry rebuild): fragment
 * cost scales with the square of resolution, so it is both the cheapest lever
 * to pull and the most effective on the fill-rate-bound devices that need it.
 */
import { Settings } from './Settings.js';

const TIERS = {
  high: { maxPixelRatio: 2.0, renderScale: 1.0, particleBudget: 150_000 },
  medium: { maxPixelRatio: 1.5, renderScale: 0.85, particleBudget: 80_000 },
  low: { maxPixelRatio: 1.0, renderScale: 0.75, particleBudget: 40_000 },
};

/**
 * Static device heuristic. Deliberately conservative and explainable:
 * coarse pointers and low core/memory counts indicate mobile-class hardware.
 * `deviceMemory` is Chromium-only; absent values default optimistic because
 * the M5 watchdog provides the safety net for over-estimation.
 */
function detectTierName() {
  const cores = navigator.hardwareConcurrency ?? 8;
  const memoryGb = navigator.deviceMemory ?? 8;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  if (memoryGb <= 2 || cores <= 2) return 'low';
  if (coarsePointer || memoryGb <= 4 || cores <= 4) return 'medium';
  return 'high';
}

export class QualityManager {
  constructor() {
    this.tierName = detectTierName();
    this.runtimeScale = 1; // watchdog resolution multiplier, [minRuntimeScale, 1]
    this.elapsed = 0; // total watched time (for warmup)
    this.lowTime = 0; // accumulated time below target fps
    this.cooldown = 0; // remaining settle time after a downgrade
  }

  /** Active tier settings ({ maxPixelRatio, renderScale, particleBudget }). */
  get tier() {
    return TIERS[this.tierName];
  }

  /**
   * The pixel ratio the renderer should actually use:
   * device DPR, capped per tier, scaled by the tier's render scale, then by
   * the watchdog's runtime scale. Fragment cost scales with the square of this
   * value — the single most effective knob on fill-rate-bound devices.
   */
  get effectivePixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(dpr, this.tier.maxPixelRatio) * this.tier.renderScale * this.runtimeScale;
  }

  /**
   * Feed one frame's timing to the watchdog. When the frame rate stays below
   * target for `sustainSeconds`, steps `runtimeScale` down by one factor and
   * returns true so the caller can re-apply the renderer resolution. Only ever
   * downgrades; a recovering frame rate decays the accumulator but never
   * restores resolution (avoids visible oscillation).
   *
   * @param {number} fps       smoothed frames per second
   * @param {number} deltaTime seconds since last frame
   * @returns {boolean} whether the resolution changed this frame
   */
  watch(fps, deltaTime) {
    const p = Settings.performance;
    this.elapsed += deltaTime;
    if (this.elapsed < p.warmupSeconds) return false; // ignore compile/ramp
    if (this.cooldown > 0) this.cooldown -= deltaTime;

    if (fps < p.targetFps) this.lowTime += deltaTime;
    else this.lowTime = Math.max(0, this.lowTime - deltaTime * 2); // recover twice as fast

    const canDowngrade =
      this.lowTime >= p.sustainSeconds &&
      this.cooldown <= 0 &&
      this.runtimeScale > p.minRuntimeScale;
    if (!canDowngrade) return false;

    this.runtimeScale = Math.max(p.minRuntimeScale, this.runtimeScale * p.downgradeFactor);
    this.lowTime = 0;
    this.cooldown = p.cooldownSeconds;
    return true;
  }
}
