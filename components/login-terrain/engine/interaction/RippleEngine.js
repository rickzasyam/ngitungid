/**
 * RippleEngine — decides when pointer movement launches impulse ripples.
 *
 * Purpose:          Convert continuous pointer motion into discrete, organic
 *                   wavefront spawns: move far enough, a ripple launches at
 *                   the cursor; stop, and the last waves propagate outward
 *                   and settle on their own.
 * Responsibilities: Spawn policy only (distance gate + rate limit). Wave
 *                   physics lives in the ParticleMaterial shader; slot
 *                   storage in ParticleSystem.
 * Dependencies:     Settings.
 * Performance:      A few scalar comparisons per frame; zero allocations.
 *                   Spawning writes one preallocated Vector4.
 *
 * Why impulses instead of the legacy standing sine: a standing wave under the
 * cursor never propagates or settles — it oscillates while hovered and stops
 * dead when sampling stops. Discrete decaying wavefronts give the
 * anticipation → motion → settling model the design demands, at the cost of
 * ~30 lines and four uniform slots (the GPU-simulation alternative was
 * rejected in the tech evaluation as complexity without visible benefit).
 */
import { Settings } from '../config/Settings.js';

export class RippleEngine {
  /**
   * @param {(x: number, z: number, amplitude: number, time: number) => void} spawn
   *   sink for launched ripples (ParticleSystem.spawnRipple).
   */
  constructor(spawn) {
    this.spawn = spawn;
    this.tracking = false;
    this.lastX = 0;
    this.lastZ = 0;
    this.lastSpawnTime = -Infinity;
  }

  /**
   * Advance the spawn policy by one frame.
   *
   * @param {number} elapsed   seconds since loop start
   * @param {number} cursorX   smoothed cursor world x
   * @param {number} cursorZ   smoothed cursor world z
   * @param {boolean} pointerActive raw pointer presence (pre-damping)
   * @param {number} strength  damped presence ∈ [0, 1] — scales amplitude
   */
  update(elapsed, cursorX, cursorZ, pointerActive, strength) {
    if (!pointerActive) {
      this.tracking = false; // re-anchor on next entry; live waves keep going
      return;
    }
    if (!this.tracking) {
      this.tracking = true;
      this.lastX = cursorX;
      this.lastZ = cursorZ;
      return;
    }

    const r = Settings.interaction.ripples;
    const dx = cursorX - this.lastX;
    const dz = cursorZ - this.lastZ;
    const travelledSq = dx * dx + dz * dz;

    if (
      travelledSq >= r.spawnDistance * r.spawnDistance &&
      elapsed - this.lastSpawnTime >= r.minInterval
    ) {
      this.spawn(cursorX, cursorZ, r.amplitude * strength, elapsed);
      this.lastX = cursorX;
      this.lastZ = cursorZ;
      this.lastSpawnTime = elapsed;
    }
  }
}
