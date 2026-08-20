/**
 * main — composition root of the particle terrain engine.
 *
 * Purpose:          Wire config, core, terrain, particles and interaction
 *                   together and define the per-frame update order.
 * Responsibilities: Wiring and lifecycle only — owns no domain logic.
 * Dependencies:     Every engine module (this is the only module allowed to
 *                   know about all of them).
 *
 * Frame order:
 *   pointer presence → cursor projection → camera parallax → particle
 *   displacement → render.
 *
 * Lifecycle: the loop runs only while the scene panel is visible — it stops
 * below the `lg` breakpoint (where the layout hides the panel) and while the
 * tab is hidden.
 *
 * Accessibility: when the OS requests reduced motion, the animation loop never
 * starts — a single static composed frame is rendered instead (and re-rendered
 * on resize). The preference is observed live, so toggling it at the OS level
 * switches between animated and static without a reload.
 *
 * Performance: a frame-rate watchdog (QualityManager) lowers render resolution
 * on sustained slowdowns.
 *
 * Dev mode: appending `?dev` to the URL dynamically imports the Tweakpane
 * tuning panel. Production builds never load it.
 */
import { QualityManager } from './config/QualityManager.js';
import { AnimationLoop } from './core/AnimationLoop.js';
import { CameraManager } from './core/CameraManager.js';
import { RendererManager } from './core/RendererManager.js';
import { SceneManager } from './core/SceneManager.js';
import { Backdrop } from './environment/Backdrop.js';
import { CursorProjector } from './interaction/CursorProjector.js';
import { PointerTracker } from './interaction/PointerTracker.js';
import { RippleEngine } from './interaction/RippleEngine.js';
import { ParticleField } from './particles/ParticleField.js';
import { damp } from './utils/MathUtils.js';

/** Tailwind `lg` — below this the layout hides the scene panel entirely. */
const SCENE_VISIBLE_QUERY = '(min-width: 1024px)';

/** Smoothing rate for the dev FPS readout and watchdog (λ per second). */
const FPS_SMOOTHING = 3;

/** OS accessibility preference: minimize non-essential motion. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Bangun mesin terrain di dalam `container` dan kembalikan fungsi pembongkarnya.
 *
 * DIUBAH DARI PROTOTIPE (hanya sejauh yang dipaksa React): dulu ini `init()`
 * yang mencari `#terrain-scene` sendiri lalu langsung dijalankan saat modul
 * dimuat, tanpa cara membongkarnya — modulnya memang tidak pernah unmount.
 * Di React komponen bisa unmount kapan saja (dan di StrictMode dev ia SELALU
 * mount-unmount-mount), jadi container diterima sebagai argumen dan seluruh
 * sumber daya dikembalikan lewat dispose().
 *
 * Tidak ada geometri, noise, kepadatan, kamera, atau timing yang disentuh.
 *
 * @param {HTMLElement} container
 * @param {{ onContextLost?: () => void }} [hooks]
 * @returns {() => void} dispose
 */
export function createTerrain(container, hooks = {}) {
  // --- Construction (all allocation happens here, none per frame) ----------
  const quality = new QualityManager();
  const backdrop = new Backdrop(container);
  const sceneManager = new SceneManager();
  const rendererManager = new RendererManager(container, quality);
  const cameraManager = new CameraManager(
    container.clientHeight > 0 ? container.clientWidth / container.clientHeight : 1,
  );
  rendererManager.onResize((width, height) => cameraManager.setAspect(width, height));

  const particles = new ParticleField(quality.tier.particleBudget);
  for (const object of particles.objects) sceneManager.add(object);
  particles.setDrawingBufferHeight(rendererManager.getDrawingBufferHeight());
  rendererManager.onResize(() =>
    particles.setDrawingBufferHeight(rendererManager.getDrawingBufferHeight()),
  );

  const pointer = new PointerTracker(container);
  const projector = new CursorProjector();
  projector.setHeightSampler(particles.createForegroundHeightSampler());
  const ripples = new RippleEngine((x, z, amplitude, time) =>
    particles.spawnRipple(x, z, amplitude, time),
  );

  const stats = { fps: 0 };

  /**
   * Render a single resting frame: base camera pose, no cursor influence.
   * Used for the reduced-motion path and to repaint after a resize while the
   * animation loop is stopped.
   */
  const renderStaticFrame = () => {
    cameraManager.reset();
    particles.update(0, 9999, 9999, 0);
    rendererManager.render(sceneManager.scene, cameraManager.camera);
  };

  // --- Per-frame pipeline ---------------------------------------------------
  const loop = new AnimationLoop((elapsed, deltaTime) => {
    stats.fps = damp(stats.fps, 1 / Math.max(deltaTime, 1e-4), FPS_SMOOTHING, deltaTime);
    // Watchdog: drop render resolution on sustained slowdown (never raise it).
    if (quality.watch(stats.fps, deltaTime)) rendererManager.applySize();

    pointer.update(deltaTime);

    // Move the camera FIRST, then cast the cursor ray, so ray–surface
    // projection uses this frame's camera pose (not last frame's). Presence
    // strength scales parallax/lift so everything settles to the resting
    // composition when the pointer leaves.
    cameraManager.update(
      elapsed,
      deltaTime,
      pointer.ndcX * pointer.strength,
      pointer.ndcY * pointer.strength,
    );
    projector.update(deltaTime, pointer.ndcX, pointer.ndcY, cameraManager.camera, pointer.hasSignal);
    ripples.update(elapsed, projector.smoothed.x, projector.smoothed.z, pointer.active, pointer.strength);

    particles.update(elapsed, projector.smoothed.x, projector.smoothed.z, pointer.strength);
    rendererManager.render(sceneManager.scene, cameraManager.camera);
  });

  // --- Run-state management -------------------------------------------------
  // The loop runs only when the panel is visible, the tab is foregrounded, and
  // the user has not requested reduced motion. In the reduced-motion case a
  // single static frame stands in for the animation.
  const sceneVisible = window.matchMedia(SCENE_VISIBLE_QUERY);
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);

  const syncRunState = () => {
    const panelShown = sceneVisible.matches && !document.hidden;
    if (!panelShown) {
      loop.stop();
    } else if (reducedMotion.matches) {
      loop.stop();
      renderStaticFrame();
    } else {
      loop.start();
    }
  };
  sceneVisible.addEventListener('change', syncRunState);
  reducedMotion.addEventListener('change', syncRunState);
  document.addEventListener('visibilitychange', syncRunState);
  // Repaint the static frame on resize while the loop is stopped (reduced
  // motion): the animated path already repaints every frame.
  rendererManager.onResize(() => {
    if (reducedMotion.matches && sceneVisible.matches && !document.hidden) renderStaticFrame();
  });
  syncRunState();

  // --- Konteks WebGL hilang -------------------------------------------------
  // Laptop yang bangun dari sleep, driver reset, atau tab GPU-nya dievakuasi
  // browser akan memancarkan ini. preventDefault() menandai bahwa konteksnya
  // BOLEH dipulihkan; kita hentikan loop dan biarkan pemanggil (React) yang
  // memutuskan tampilan penggantinya. Prototipe tidak menangani ini sama
  // sekali — kanvasnya cuma membeku jadi kotak hitam.
  const canvas = rendererManager.renderer.domElement;
  const onContextLost = (event) => {
    event.preventDefault();
    loop.stop();
    hooks.onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // --- Pembongkaran ---------------------------------------------------------
  // Setiap dispose() di bawah SUDAH ADA di prototipe; main.js-nya saja yang
  // tidak pernah memanggilnya karena modulnya tidak pernah unmount.
  return function dispose() {
    loop.stop();
    canvas.removeEventListener('webglcontextlost', onContextLost);
    sceneVisible.removeEventListener('change', syncRunState);
    reducedMotion.removeEventListener('change', syncRunState);
    document.removeEventListener('visibilitychange', syncRunState);
    pointer.dispose();
    particles.dispose();
    rendererManager.dispose(); // melepas GL context + mencabut <canvas> dari DOM
    backdrop.dispose();
  };
}
