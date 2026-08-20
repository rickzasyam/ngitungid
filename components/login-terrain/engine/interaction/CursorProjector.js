/**
 * CursorProjector — projects the pointer onto the terrain SURFACE.
 *
 * Purpose:          Convert pointer NDC into a smoothed world-space point that
 *                   lies on the actual terrain height field, so cursor
 *                   interaction (dome + ripples) originates exactly under the
 *                   cursor.
 * Responsibilities: Ray–surface intersection and smoothing only.
 * Dependencies:     Settings, MathUtils, three (Raycaster, Plane, Vector2/3).
 *
 * Why ray–surface, not ray–plane (bug fix): the previous implementation
 * intersected the pointer ray with a flat horizontal plane. Because the
 * terrain is a tall height field viewed from an elevated, downward-looking
 * camera, a ray aimed at a peak passes through the peak and hits the flat
 * plane at a point DEEPER in the scene. The interaction then originated at
 * that deeper xz — whose particles sit lower and project higher on screen —
 * so the deformation appeared ABOVE the cursor. Intersecting the real surface
 * removes the mismatch by construction: the hit point lies on the ray (so it
 * reprojects to the exact cursor pixel) AND on the terrain (so it is the
 * particle the user is pointing at). This is exact, not an empirical offset,
 * and stays correct under camera drift, resize and terrain regeneration
 * because it re-derives from the live camera ray and height sampler each frame.
 *
 * Performance: one ray-march per frame (not per particle). A coarse forward
 * march finds the sign change where the ray crosses below the surface, then a
 * few bisection steps refine it. All vectors are preallocated — zero
 * per-frame allocation.
 */
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { Settings } from '../config/Settings.js';
import { dampFactor } from '../utils/MathUtils.js';

/** Sentinel far outside the terrain so nothing reacts before the first signal. */
const FAR_AWAY = 9999;

/** Ray-march tuning. Distances in world units along the (normalized) ray. */
const MARCH_MAX_DISTANCE = 60; // covers the whole field from the camera
const MARCH_STEP = 0.35; // coarse step — smaller than the smallest ridge feature
const BISECTION_ITERATIONS = 12; // ~0.35 / 2^12 ≈ sub-millimetre refinement

export class CursorProjector {
  constructor() {
    this.raycaster = new Raycaster();
    this.ndc = new Vector2();
    this.worldPoint = new Vector3(FAR_AWAY, 0, FAR_AWAY); // latest raw hit
    this.smoothed = new Vector3(FAR_AWAY, 0, FAR_AWAY); // damped, consumed by particles

    // Fallback plane, used only when the ray misses the terrain (pointing at
    // open sky above the ridgelines).
    this.fallbackPlane = new Plane(new Vector3(0, 1, 0), -Settings.interaction.planeHeight);
    this.fallbackHit = new Vector3();

    // Preallocated march scratch vectors.
    this.marchPoint = new Vector3();
    this.prevPoint = new Vector3();
    this.lo = new Vector3();
    this.hi = new Vector3();
    this.mid = new Vector3();

    // (worldX, worldZ) => worldY of the interactive (foreground) surface.
    this.sampleHeight = null;
  }

  /** Provide/replace the foreground height sampler (set at init and on rebake). */
  setHeightSampler(sampler) {
    this.sampleHeight = sampler;
  }

  /**
   * Advance projection and smoothing by one frame.
   *
   * The camera must already hold this frame's transform; `update` refreshes
   * `camera.matrixWorld` before building the ray so the projection is never a
   * frame behind during drift/parallax.
   *
   * @param {number} deltaTime seconds since last frame
   * @param {number} ndcX      pointer NDC x
   * @param {number} ndcY      pointer NDC y
   * @param {import('three').PerspectiveCamera} camera
   * @param {boolean} hasSignal whether a pointer has ever been seen
   */
  update(deltaTime, ndcX, ndcY, camera, hasSignal) {
    if (hasSignal) {
      camera.updateMatrixWorld();
      this.ndc.set(ndcX, ndcY);
      this.raycaster.setFromCamera(this.ndc, camera);
      if (!this.#intersectSurface(this.raycaster.ray)) {
        // Sky: fall back to the flat plane so the point stays finite.
        if (this.raycaster.ray.intersectPlane(this.fallbackPlane, this.fallbackHit) !== null) {
          this.worldPoint.copy(this.fallbackHit);
        }
      }
    }
    this.smoothed.lerp(
      this.worldPoint,
      dampFactor(Settings.interaction.cursorDamping, deltaTime),
    );
  }

  /**
   * March `ray` until it crosses below the terrain surface, then bisect to the
   * intersection. Writes the hit into `this.worldPoint` and returns true, or
   * returns false if the ray never goes below the surface within range.
   * @param {import('three').Ray} ray
   * @returns {boolean}
   */
  #intersectSurface(ray) {
    if (!this.sampleHeight) return false;

    // Signed height of the ray above the surface at distance t.
    // Positive = ray above terrain, negative = below.
    const above = (point) => point.y - this.sampleHeight(point.x, point.z);

    ray.at(0, this.prevPoint);
    let prevAbove = above(this.prevPoint);
    // If the camera itself starts below the surface the model is invalid;
    // bail to the fallback.
    if (prevAbove < 0) return false;

    for (let t = MARCH_STEP; t <= MARCH_MAX_DISTANCE; t += MARCH_STEP) {
      ray.at(t, this.marchPoint);
      const cur = above(this.marchPoint);
      if (cur <= 0) {
        // Sign change between prevPoint (above) and marchPoint (below): bisect.
        this.lo.copy(this.prevPoint); // above
        this.hi.copy(this.marchPoint); // below
        for (let i = 0; i < BISECTION_ITERATIONS; i++) {
          this.mid.addVectors(this.lo, this.hi).multiplyScalar(0.5);
          if (above(this.mid) > 0) this.lo.copy(this.mid);
          else this.hi.copy(this.mid);
        }
        this.worldPoint.addVectors(this.lo, this.hi).multiplyScalar(0.5);
        return true;
      }
      this.prevPoint.copy(this.marchPoint);
      prevAbove = cur;
    }
    return false;
  }

  /** Re-read the fallback plane height from Settings (dev-panel hook). */
  applySettings() {
    this.fallbackPlane.constant = -Settings.interaction.planeHeight;
  }
}
