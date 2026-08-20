/**
 * MathUtils — allocation-free scalar math helpers shared across the engine.
 *
 * Purpose:          Small pure functions used in hot paths (render loop,
 *                   terrain generation).
 * Responsibilities: Scalar interpolation, clamping, damping. Nothing else.
 * Dependencies:     None.
 * Performance:      Number-only operations, zero allocation — safe inside the
 *                   render loop.
 */

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation from `a` to `b` by factor `t` (not clamped). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Frame-rate-independent exponential damping.
 *
 * Replaces per-frame `lerp(current, target, k)` smoothing, which settles twice
 * as fast at 120 Hz as at 60 Hz. `lambda` expresses smoothing strength per
 * second, so motion is identical on every display.
 *
 * Converting a legacy per-frame factor `k` tuned at 60 FPS:
 * `lambda = -ln(1 - k) * 60`.
 */
export function damp(current, target, lambda, deltaTime) {
  return lerp(current, target, 1 - Math.exp(-lambda * deltaTime));
}

/**
 * Per-frame damping factor for `lambda` at `deltaTime`.
 * Hoist this out of particle loops: compute once per frame, apply per particle.
 */
export function dampFactor(lambda, deltaTime) {
  return 1 - Math.exp(-lambda * deltaTime);
}

/** Hermite smoothstep of an already-normalized value t ∈ [0, 1]. */
export function smoothstep01(t) {
  return t * t * (3 - 2 * t);
}
