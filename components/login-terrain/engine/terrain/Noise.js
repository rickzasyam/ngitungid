/**
 * Noise — seeded gradient-noise engine for terrain generation.
 *
 * Purpose:          2D gradient (Perlin-style) noise with FBM and ridged
 *                   multifractal combinators. Replaces the legacy sin-hash
 *                   value noise (M1 per the approved roadmap).
 * Responsibilities: Pure procedural math. No knowledge of grids, particles,
 *                   composition or Settings.
 * Dependencies:     Random (seeded permutation table).
 * Performance:      Init-time only (~1M evaluations per terrain bake). Each
 *                   sample is table lookups + a few multiplies; no allocation
 *                   after construction.
 *
 * Why gradient noise over the legacy value noise:
 * - Value noise interpolates random *heights* at lattice points → blocky,
 *   grid-aligned plateaus. Gradient noise interpolates random *slopes*, giving
 *   organic, continuous ridge flow.
 * - The legacy `sin(x·k1 + y·k2)` hash carries visible directional
 *   correlation; a seeded permutation table does not.
 *
 * Why rotated-octave FBM instead of simplex:
 * - Simplex's main practical win is isotropy. Rotating the sampling frame a
 *   fixed angle per octave breaks lattice alignment across octaves and, when
 *   combined with domain warping (TerrainGenerator), removes visible axis
 *   bias — at a fraction of simplex's implementation/verification risk.
 *
 * Determinism: identical seed ⇒ identical terrain, on every platform.
 */
import { mulberry32 } from '../utils/Random.js';

/** Eight unit gradients (axes + diagonals). Flat array to avoid object refs. */
const GRADIENTS = new Float32Array([
  1, 0, -1, 0, 0, 1, 0, -1,
  Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2,
  Math.SQRT1_2, -Math.SQRT1_2, -Math.SQRT1_2, -Math.SQRT1_2,
]);

/**
 * 2D gradient noise with unit gradients is bounded by ±√2/2; this rescales
 * the practical output range to approximately [-1, 1].
 */
const NORMALIZE_2D = Math.SQRT2;

/** Quintic fade — C2-continuous, eliminates lattice creasing. */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class NoiseField {
  /**
   * @param {number} seed
   * @param {{ lacunarity: number, gain: number, octaveRotation: number }} config
   *   lacunarity: frequency multiplier per octave (2 = classic)
   *   gain:       amplitude multiplier per octave (0.5 = classic)
   *   octaveRotation: radians the sampling frame rotates per octave
   */
  constructor(seed, { lacunarity, gain, octaveRotation }) {
    this.lacunarity = lacunarity;
    this.gain = gain;
    this.rotCos = Math.cos(octaveRotation);
    this.rotSin = Math.sin(octaveRotation);

    // Seeded permutation table (doubled to avoid index wrapping).
    const random = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Single-octave gradient noise → approximately [-1, 1]. */
  noise2D(x, y) {
    const perm = this.perm;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[X] + Y] & 7;
    const ba = perm[perm[X + 1] + Y] & 7;
    const ab = perm[perm[X] + Y + 1] & 7;
    const bb = perm[perm[X + 1] + Y + 1] & 7;

    const dotAA = GRADIENTS[aa * 2] * xf + GRADIENTS[aa * 2 + 1] * yf;
    const dotBA = GRADIENTS[ba * 2] * (xf - 1) + GRADIENTS[ba * 2 + 1] * yf;
    const dotAB = GRADIENTS[ab * 2] * xf + GRADIENTS[ab * 2 + 1] * (yf - 1);
    const dotBB = GRADIENTS[bb * 2] * (xf - 1) + GRADIENTS[bb * 2 + 1] * (yf - 1);

    const top = dotAA + (dotBA - dotAA) * u;
    const bottom = dotAB + (dotBB - dotAB) * u;
    return (top + (bottom - top) * v) * NORMALIZE_2D;
  }

  /**
   * Fractal Brownian motion with per-octave frame rotation → [-1, 1].
   */
  fbm2D(x, y, octaves) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let max = 0;
    let px = x;
    let py = y;
    for (let i = 0; i < octaves; i++) {
      value += this.noise2D(px * frequency, py * frequency) * amplitude;
      max += amplitude;
      amplitude *= this.gain;
      frequency *= this.lacunarity;
      const rx = px * this.rotCos - py * this.rotSin;
      py = px * this.rotSin + py * this.rotCos;
      px = rx;
    }
    return value / max;
  }

  /**
   * Ridged multifractal (Musgrave-style) → [0, 1].
   *
   * Each octave folds noise around its peaks (`offset - |n|`, raised to
   * `sharpness`) and is weighted by the previous octave's result
   * (`weightFeedback`), so detail concentrates on ridge crests instead of
   * being spread uniformly — the signature look of eroded mountain ranges.
   *
   * @param {number} offset          fold offset (1 = classic)
   * @param {number} weightFeedback  0..1 strength of crest-concentration
   * @param {number} sharpness       crest exponent: 2 = classic needle-sharp
   *                                 ridges, 1 = soft folds. The art dial for
   *                                 "how alpine do summits look".
   */
  ridged2D(x, y, octaves, offset, weightFeedback, sharpness) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let max = 0;
    let weight = 1;
    let px = x;
    let py = y;
    for (let i = 0; i < octaves; i++) {
      let n = offset - Math.abs(this.noise2D(px * frequency, py * frequency));
      n = Math.pow(Math.max(n, 0), sharpness);
      n *= weight;
      weight = Math.min(1, Math.max(0, n * weightFeedback));
      value += n * amplitude;
      max += amplitude;
      amplitude *= this.gain;
      frequency *= this.lacunarity;
      const rx = px * this.rotCos - py * this.rotSin;
      py = px * this.rotSin + py * this.rotCos;
      px = rx;
    }
    return value / max;
  }
}
