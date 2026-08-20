/**
 * ParticleSystem — owns particle geometry and the GPU-driven Points object.
 *
 * Purpose:          Turn baked terrain data into static GPU buffers and drive
 *                   the ParticleMaterial's per-frame uniforms.
 * Responsibilities: GPU resource ownership (geometry, material) and uniform
 *                   updates. Terrain shape belongs to TerrainGenerator; shader
 *                   logic to ParticleMaterial; cursor state to interaction/.
 * Dependencies:     Settings, ParticleMaterial, three.
 *
 * Performance (M2 — the roadmap keystone, replacing the M0/M1 CPU path):
 * - Attributes are uploaded once (static usage — the default — is now the
 *   truthful declaration). No per-frame buffer writes, no `needsUpdate`.
 * - `update()` writes exactly 4 uniform scalars/vectors per frame, a cost
 *   independent of particle count. The previous CPU path cost ~2.7 ms/frame
 *   at 57k particles and scaled linearly.
 * - Frustum-culling correctness for GPU displacement: the bounding sphere is
 *   inflated by the maximum shader displacement so the object is never
 *   wrongly culled by CPU-side bounds that cannot see shader motion.
 */
import { BufferAttribute, BufferGeometry, Points } from 'three';
import { Settings } from '../config/Settings.js';
import { createParticleMaterial, syncParticleUniforms } from './ParticleMaterial.js';

export class ParticleSystem {
  /**
   * @param {ReturnType<import('../terrain/TerrainGenerator.js').generateTerrain>} terrain
   * @param {object} [layerConfig] per-layer look overrides (Settings.environment.layers
   *   entry). Defaults to an identity foreground layer.
   */
  constructor(terrain, layerConfig = {}) {
    this.layerConfig = { sizeScale: 1, tint: '#ffffff', ...layerConfig };
    this.material = createParticleMaterial();
    this.points = new Points(this.#buildGeometry(terrain), this.material);
    this.#applyLayerLook();
    // Render deeper layers first so nearer layers paint over them (the alpha
    // blend has no depth test between separate objects).
    this.points.renderOrder = -(this.layerConfig.zOffset ?? 0);
  }

  /** The scene-graph object this system renders. */
  get object3d() {
    return this.points;
  }

  /**
   * Build static geometry from baked terrain data.
   * @param {object} terrain output of generateTerrain()
   * @returns {BufferGeometry}
   */
  #buildGeometry(terrain) {
    this.count = terrain.count;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(terrain.positions, 3));
    geometry.setAttribute('aAltitude', new BufferAttribute(terrain.altitudes, 1));
    geometry.setAttribute('aSeed', new BufferAttribute(terrain.seeds, 1));

    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius +=
      Settings.interaction.liftAmount +
      Settings.interaction.ripples.amplitude +
      Settings.animation.breathing.amplitude;

    return geometry;
  }

  /**
   * Launch an impulse ripple (called by RippleEngine). Slots are recycled
   * round-robin; writing a Vector4 in place allocates nothing.
   */
  spawnRipple(originX, originZ, amplitude, startTime) {
    const slots = this.material.uniforms.uRipples.value;
    this.nextRippleSlot = ((this.nextRippleSlot ?? 0) + 1) % slots.length;
    slots[this.nextRippleSlot].set(originX, originZ, startTime, amplitude);
  }

  /**
   * Replace the terrain in place (dev-panel regeneration). Material and scene
   * wiring untouched; old GPU buffers disposed.
   */
  rebuild(terrain) {
    const oldGeometry = this.points.geometry;
    this.points.geometry = this.#buildGeometry(terrain);
    oldGeometry.dispose();
  }

  /**
   * Apply per-layer look on top of the global uniforms: distant layers use
   * smaller particles and a dim/cool tint. Called after every global sync so
   * layer overrides always win.
   */
  #applyLayerLook() {
    const u = this.material.uniforms;
    u.uSize.value = Settings.particles.size * this.layerConfig.sizeScale;
    u.uLayerTint.value.set(this.layerConfig.tint);
  }

  /** Re-push all Settings-derived uniforms then re-apply layer look (dev hook). */
  applySettings() {
    syncParticleUniforms(this.material);
    this.#applyLayerLook();
  }

  /**
   * Point-size attenuation needs the drawing-buffer height (device px).
   * Called on init and on every resize.
   */
  setDrawingBufferHeight(heightPx) {
    this.material.uniforms.uScale.value = heightPx * 0.5;
  }

  /**
   * Advance the animation by one frame — uniform writes only.
   *
   * @param {number} elapsed        seconds since loop start (pause-aware)
   * @param {number} cursorX        smoothed cursor world x
   * @param {number} cursorZ        smoothed cursor world z
   * @param {number} cursorStrength interaction presence ∈ [0, 1]
   */
  update(elapsed, cursorX, cursorZ, cursorStrength) {
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uCursor.value.set(cursorX, cursorZ);
    u.uCursorStrength.value = cursorStrength;
  }

  /** Release GPU resources. */
  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
