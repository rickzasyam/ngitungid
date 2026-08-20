/**
 * Composition — art-direction masks that shape the terrain.
 *
 * Purpose:          Guarantee the scene's composition regardless of what the
 *                   noise happens to produce: a raised background massif, a
 *                   mid-ground ridge band, and fill mass near the visual
 *                   center. This is what deterministically eliminates the
 *                   "large empty valley in the center" — noise provides
 *                   organic variation *inside* this frame, never the frame
 *                   itself.
 * Responsibilities: Spatial shaping functions only. No noise, no grids.
 * Dependencies:     Settings, MathUtils.
 * Performance:      Init-time only (called during terrain baking).
 *
 * Spatial frame: the camera sits at +z looking toward -z, so "background"
 * means negative z. Masks are modulated by the local ridge value so lifts stay
 * mountainous instead of reading as smooth artificial berms.
 */
import { Settings } from '../config/Settings.js';
import { clamp, smoothstep01 } from '../utils/MathUtils.js';

/**
 * Background massif: height ramp rising from nearZ toward farZ so the far
 * silhouette is always tall — the primary depth backdrop.
 */
export function backdropLift(z) {
  const { nearZ, farZ, lift } = Settings.terrain.composition.backdrop;
  const t = clamp((nearZ - z) / (nearZ - farZ), 0, 1);
  return smoothstep01(t) * lift;
}

/**
 * Mid-ground ridge: a gaussian band across the field at `centerZ`, giving the
 * composition a second silhouette layer between foreground and backdrop.
 * @param {number} ridges local ridged-noise value ∈ [0, 1]
 */
export function midRidgeLift(z, ridges) {
  const { centerZ, width, lift } = Settings.terrain.composition.midRidge;
  const d = (z - centerZ) / width;
  return Math.exp(-d * d) * lift * (0.4 + 0.6 * ridges);
}

/**
 * Center fill: a soft radial mound near the visual center (slightly offset so
 * it reads organic, not planted). Guarantees the center can never be empty.
 * @param {number} ridges local ridged-noise value ∈ [0, 1]
 */
export function centerFillLift(x, z, ridges) {
  const c = Settings.terrain.composition.centerFill;
  const dx = (x - c.x) / c.radius;
  const dz = (z - c.z) / c.radius;
  return Math.exp(-(dx * dx + dz * dz)) * c.lift * (0.5 + 0.5 * ridges);
}
