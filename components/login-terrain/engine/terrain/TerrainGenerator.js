/**
 * TerrainGenerator — bakes the static mountain field into typed arrays.
 *
 * Purpose:          Orchestrate noise (NoiseField) and art direction
 *                   (Composition) into per-particle positions, normalized
 *                   altitudes and random seeds.
 * Responsibilities: Terrain assembly only. Owns no GPU resources — output is
 *                   plain typed arrays consumed by ParticleSystem, keeping
 *                   generation testable without a WebGL context.
 * Dependencies:     Settings, Noise, Composition, Random, MathUtils.
 * Performance:      Runs once at init (and on dev-panel regeneration).
 *                   ~16 noise evaluations per particle; zero runtime cost.
 *                   Fully deterministic from Settings.terrain.seed.
 *
 * ORDERING INVARIANT (relied on by ParticleMaterial): rows are generated from
 * far z (negative) to near z (positive). With the camera always on the +z
 * side, buffer order is back-to-front, which is what makes the particles'
 * normal (non-additive) alpha blending render correct occlusion without any
 * runtime sorting. Do not reorder the generation loop.
 *
 * Height recipe (per sample):
 *   1. Domain warp — the ridge-sampling position is displaced by two
 *      decorrelated FBM fields, bending ridgelines into organic curves.
 *   2. Ridged multifractal at the warped position → mountain silhouettes.
 *   3. Envelope FBM (unwarped, macro scale) modulates where mass appears.
 *   4. Composition lifts (backdrop massif, mid ridge, center fill) frame the
 *      scene so the center can never read empty.
 *   5. Micro FBM adds fine surface detail; baseline drops valley floors.
 */
import { Settings } from '../config/Settings.js';
import { clamp } from '../utils/MathUtils.js';
import { mulberry32 } from '../utils/Random.js';
import { backdropLift, centerFillLift, midRidgeLift } from './Composition.js';
import { NoiseField } from './Noise.js';

/**
 * Fixed offsets decorrelating the two warp axes from each other and from the
 * ridge field. Arbitrary non-round values; changing them changes the terrain
 * "identity" the same way the seed does.
 */
const WARP_OFFSET_X = { x: 13.7, z: 91.3 };
const WARP_OFFSET_Z = { x: 57.1, z: 7.9 };

/** Seed offsets so jitter and per-particle seeds draw independent streams. */
const JITTER_SEED_OFFSET = 0x9e37;
const PARTICLE_SEED_OFFSET = 0x79b9;

/** Terrain height at world-space (x, z). */
function terrainHeight(noise, x, z) {
  const { noise: n, composition: c } = Settings.terrain;

  const wx =
    x +
    n.warp.strength *
      noise.fbm2D((x + WARP_OFFSET_X.x) * n.warp.scale, (z + WARP_OFFSET_X.z) * n.warp.scale, n.warp.octaves);
  const wz =
    z +
    n.warp.strength *
      noise.fbm2D((x + WARP_OFFSET_Z.x) * n.warp.scale, (z + WARP_OFFSET_Z.z) * n.warp.scale, n.warp.octaves);

  const ridges = noise.ridged2D(
    wx * n.ridge.scale,
    wz * n.ridge.scale,
    n.ridge.octaves,
    n.ridge.offset,
    n.ridge.weightFeedback,
    n.ridge.sharpness,
  );
  const envelope = (noise.fbm2D(x * n.envelope.scale, z * n.envelope.scale, n.envelope.octaves) + 1) * 0.5;
  const micro = noise.fbm2D(x * n.micro.scale, z * n.micro.scale, n.micro.octaves) * n.micro.amplitude;

  const base = ridges * c.peakHeight * (c.envelopeFloor + envelope * c.envelopeGain);
  // The backdrop massif is modulated by the macro envelope: without this the
  // far silhouette is ridge noise at constant amplitude and its fundamental
  // wavelength reads as an artificial, evenly-spaced scallop rhythm.
  const backdropVariation = c.backdrop.variationBase + envelope * c.backdrop.variationGain;
  const lift =
    backdropLift(z) * backdropVariation + midRidgeLift(z, ridges) + centerFillLift(x, z, ridges);

  return base + lift + micro - c.baseline;
}

/**
 * Identity layer — reproduces the single hero terrain exactly. Any field the
 * caller omits falls back to these, so `generateTerrain()` with no arguments
 * is unchanged from the pre-M4 behavior.
 */
const DEFAULT_LAYER = {
  seedOffset: 0,
  zOffset: 0,
  cols: null, // null → use Settings.terrain.grid
  rows: null,
  heightScale: 1.0,
  baselineLift: 0.0,
};

/**
 * Generate one particle layer.
 *
 * @param {object} [options]
 * @param {object} [options.layer] layer config (see Settings.environment.layers);
 *   omitted fields fall back to DEFAULT_LAYER (the hero terrain).
 * @param {number} [options.particleBudget] device cap (QualityManager tier).
 *   When the layer grid exceeds it, both axes scale down proportionally so
 *   world extent and aspect are preserved — only density drops.
 * @returns {{
 *   count: number,
 *   positions: Float32Array,  // xyz per particle (y = height, z includes zOffset)
 *   altitudes: Float32Array,  // normalized height [0, 1] per particle
 *   seeds: Float32Array,      // random [0, 1) per particle (phase, size)
 * }}
 */
export function generateTerrain(options = {}) {
  const layer = { ...DEFAULT_LAYER, ...(options.layer ?? {}) };
  const particleBudget = options.particleBudget;

  const { seed, grid } = Settings.terrain;
  const baseCols = layer.cols ?? grid.cols;
  const baseRows = layer.rows ?? grid.rows;
  const { spacing, jitter } = grid;

  let cols = baseCols;
  let rows = baseRows;
  if (particleBudget && cols * rows > particleBudget) {
    const scale = Math.sqrt(particleBudget / (cols * rows));
    cols = Math.max(2, Math.floor(cols * scale));
    rows = Math.max(2, Math.floor(rows * scale));
  }
  const count = cols * rows;

  // Per-layer seed offset decorrelates each layer's noise identity while the
  // jitter/particle-seed streams stay independent of the noise stream.
  const layerSeed = (seed + layer.seedOffset) | 0;
  const noise = new NoiseField(layerSeed, Settings.terrain.noise);
  const jitterRandom = mulberry32(layerSeed ^ JITTER_SEED_OFFSET);
  const seedRandom = mulberry32(layerSeed ^ PARTICLE_SEED_OFFSET);

  const positions = new Float32Array(count * 3);
  const altitudes = new Float32Array(count);
  const seeds = new Float32Array(count);

  // Grid spacing scales inversely with density reduction so the field keeps
  // its world extent on budget-limited devices.
  const effectiveSpacingX = (baseCols * spacing) / cols;
  const effectiveSpacingZ = (baseRows * spacing) / rows;
  const jitterAmpX = effectiveSpacingX * jitter;
  const jitterAmpZ = effectiveSpacingZ * jitter;

  let minH = Infinity;
  let maxH = -Infinity;

  // See ORDERING INVARIANT above: gz ascending ⇒ z from far to near.
  for (let i = 0; i < count; i++) {
    const gx = i % cols;
    const gz = Math.floor(i / cols);
    const x = (gx - cols / 2) * effectiveSpacingX + (jitterRandom() - 0.5) * jitterAmpX;
    // Local z drives the noise + composition; the layer is placed in the world
    // by adding zOffset afterwards, so composition stays consistent per layer.
    const localZ = (gz - rows / 2) * effectiveSpacingZ + (jitterRandom() - 0.5) * jitterAmpZ;
    const h = terrainHeight(noise, x, localZ) * layer.heightScale + layer.baselineLift;

    seeds[i] = seedRandom();
    altitudes[i] = h; // raw height; normalized below
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;

    positions[i * 3] = x;
    positions[i * 3 + 1] = h;
    positions[i * 3 + 2] = localZ + layer.zOffset;
  }

  const range = Math.max(0.0001, maxH - minH);
  for (let i = 0; i < count; i++) {
    altitudes[i] = clamp((altitudes[i] - minH) / range, 0, 1);
  }

  return { count, positions, altitudes, seeds };
}

/**
 * Build a world-space height sampler for a layer — the continuous surface the
 * particles of that layer sit on.
 *
 * Used by CursorProjector to intersect the pointer ray with the *actual*
 * terrain (not a flat plane), so the interaction origin is the true surface
 * point under the cursor. The math mirrors generateTerrain exactly:
 *   worldY(worldX, worldZ) = terrainHeight(localX, localZ) * heightScale
 *                            + baselineLift,   where localZ = worldZ - zOffset.
 * Jitter is intentionally ignored — it only scatters points around this
 * continuous surface; the surface itself is what the ray should hit.
 *
 * @param {object} [layer] layer config (defaults to the hero foreground).
 * @returns {(worldX: number, worldZ: number) => number}
 */
export function createHeightSampler(layer = {}) {
  const cfg = { ...DEFAULT_LAYER, ...layer };
  const layerSeed = (Settings.terrain.seed + cfg.seedOffset) | 0;
  const noise = new NoiseField(layerSeed, Settings.terrain.noise);
  return function sampleHeight(worldX, worldZ) {
    return terrainHeight(noise, worldX, worldZ - cfg.zOffset) * cfg.heightScale + cfg.baselineLift;
  };
}
