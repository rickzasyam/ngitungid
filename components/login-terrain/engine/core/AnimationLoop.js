/**
 * AnimationLoop — owns the render loop.
 *
 * Purpose:          requestAnimationFrame scheduling, delta-time clock,
 *                   pause/resume control.
 * Responsibilities: Timing only; the update callback owns all per-frame work.
 * Dependencies:     Settings, MathUtils.
 * Performance:      Delta time is clamped (Settings.animation.maxDeltaTime) so
 *                   returning from a background tab never produces a physics
 *                   jump. Elapsed time advances only while running, so
 *                   animation phase is continuous across pauses.
 */
import { Settings } from '../config/Settings.js';
import { clamp } from '../utils/MathUtils.js';

export class AnimationLoop {
  /** @param {(elapsed: number, deltaTime: number) => void} update */
  constructor(update) {
    this.update = update;
    this.running = false;
    this.elapsed = 0;
    this.prevTime = 0;
    this.frameId = 0;
    this.tick = this.tick.bind(this);
  }

  /** Start (or resume) the loop. Safe to call redundantly. */
  start() {
    if (this.running) return;
    this.running = true;
    this.prevTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  /** Pause the loop. Safe to call redundantly. */
  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  /** @param {number} now high-resolution timestamp from requestAnimationFrame */
  tick(now) {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(this.tick);

    const deltaTime = clamp((now - this.prevTime) / 1000, 0, Settings.animation.maxDeltaTime);
    this.prevTime = now;
    this.elapsed += deltaTime;

    this.update(this.elapsed, deltaTime);
  }
}
