/**
 * ParticleField — coordinates the stack of depth layers.
 *
 * Purpose:          Own the set of ParticleSystem layers (foreground hero +
 *                   deeper skyline bands) and present one aggregate interface
 *                   to main.js, so the composition root stays layer-agnostic.
 * Responsibilities: Layer construction from Settings.environment.layers,
 *                   particle-budget distribution, fan-out of per-frame updates,
 *                   and routing interaction to the foreground layer only.
 * Dependencies:     Settings, ParticleSystem, TerrainGenerator.
 *
 * Interaction policy: only layer[0] is interactive. Deeper layers are distant
 * skyline — the cursor never reaches them, so they receive breathing + drift
 * only (cursorStrength 0) and no ripples. This is both correct and cheaper.
 *
 * Performance: per-frame cost is one uniform-write batch per layer (all
 * count-independent). Layer count is small (3) and fixed; draw calls = layers.
 */
import { Settings } from '../config/Settings.js';
import { createHeightSampler, generateTerrain } from '../terrain/TerrainGenerator.js';
import { ParticleSystem } from './ParticleSystem.js';

export class ParticleField {
  /** @param {number} [particleBudget] device cap (QualityManager tier). */
  constructor(particleBudget) {
    this.particleBudget = particleBudget;
    this.layers = Settings.environment.layers.map((config) => {
      const terrain = generateTerrain({ layer: config, particleBudget: this.#layerBudget(config) });
      return new ParticleSystem(terrain, config);
    });
    this.foreground = this.layers[0];
  }

  /**
   * Split the device budget across layers in proportion to their configured
   * density, so adding depth layers never blows the total particle count.
   * @param {object} config a Settings.environment.layers entry
   * @returns {number|undefined} per-layer budget, or undefined when unbounded
   */
  #layerBudget(config) {
    if (!this.particleBudget) return undefined;
    const grid = Settings.terrain.grid;
    const configured = Settings.environment.layers.reduce(
      (sum, l) => sum + (l.cols ?? grid.cols) * (l.rows ?? grid.rows),
      0,
    );
    const share = ((config.cols ?? grid.cols) * (config.rows ?? grid.rows)) / configured;
    return Math.floor(this.particleBudget * share);
  }

  /** Scene-graph objects for every layer (main adds them all to the scene). */
  get objects() {
    return this.layers.map((layer) => layer.object3d);
  }

  /** Propagate the drawing-buffer height to every layer (point-size scaling). */
  setDrawingBufferHeight(heightPx) {
    for (const layer of this.layers) layer.setDrawingBufferHeight(heightPx);
  }

  /** Ripples only affect the interactive foreground layer. */
  spawnRipple(originX, originZ, amplitude, startTime) {
    this.foreground.spawnRipple(originX, originZ, amplitude, startTime);
  }

  /**
   * Height sampler for the interactive foreground surface — the surface the
   * CursorProjector ray-marches so interaction originates under the cursor.
   * Rebuilt from the same layer config the foreground geometry was baked from,
   * so it stays exact after terrain regeneration.
   * @returns {(worldX: number, worldZ: number) => number}
   */
  createForegroundHeightSampler() {
    return createHeightSampler(Settings.environment.layers[0]);
  }

  /**
   * Advance every layer by one frame. Cursor interaction reaches the
   * foreground only; deeper layers animate with breathing/drift alone.
   */
  update(elapsed, cursorX, cursorZ, cursorStrength) {
    this.foreground.update(elapsed, cursorX, cursorZ, cursorStrength);
    for (let i = 1; i < this.layers.length; i++) {
      this.layers[i].update(elapsed, 9999, 9999, 0);
    }
  }

  /** Re-push uniforms on every layer (dev-panel look edits). */
  applySettings() {
    for (const layer of this.layers) layer.applySettings();
  }

  /** Regenerate every layer's terrain in place (dev-panel rebake). */
  rebuild() {
    for (let i = 0; i < this.layers.length; i++) {
      const config = Settings.environment.layers[i];
      this.layers[i].rebuild(
        generateTerrain({ layer: config, particleBudget: this.#layerBudget(config) }),
      );
    }
  }

  /** Release GPU resources for every layer. */
  dispose() {
    for (const layer of this.layers) layer.dispose();
  }
}
