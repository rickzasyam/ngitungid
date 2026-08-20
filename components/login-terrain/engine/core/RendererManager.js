/**
 * RendererManager — owns the WebGLRenderer lifecycle.
 *
 * Purpose:          Renderer creation, color pipeline, sizing policy, disposal.
 * Responsibilities: Everything about *how* the canvas renders; nothing about
 *                   *what* it renders.
 * Dependencies:     Settings, QualityManager, three.
 *
 * Color pipeline: sRGB output (three.js default) + a selectable tone-mapping
 * operator (Settings.renderer.toneMapping). ACES was chosen in the M4 grade
 * comparison — filmic highlight rolloff keeps the brand lime from clipping to
 * white and gives the grade its density; AgX pulled the green too far toward
 * neutral, Neutral clipped peaks harder. The operator stays swappable so the
 * decision is auditable and reversible.
 *
 * Sizing: a ResizeObserver on the host container — the canvas lives in a 60%
 * flex panel that can resize independently of the window. A window resize
 * listener is kept as well: it fires when the window moves between monitors
 * with different device pixel ratios, which the ResizeObserver cannot see.
 */
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  WebGLRenderer,
} from 'three';
import { Settings } from '../config/Settings.js';

/** Settings string → three tone-mapping constant. */
const TONE_MAPPING = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  none: NoToneMapping,
};

export class RendererManager {
  /**
   * @param {HTMLElement} container host element the canvas mounts into
   * @param {import('../config/QualityManager.js').QualityManager} quality
   */
  constructor(container, quality) {
    this.container = container;
    this.quality = quality;
    this.resizeCallbacks = [];

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = TONE_MAPPING[Settings.renderer.toneMapping] ?? ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = Settings.renderer.toneMappingExposure;
    this.renderer.setClearColor(0x000000, Settings.renderer.clearAlpha);
    container.appendChild(this.renderer.domElement);

    this.applySize = this.applySize.bind(this);
    this.resizeObserver = new ResizeObserver(this.applySize);
    this.resizeObserver.observe(container);
    window.addEventListener('resize', this.applySize);
    this.applySize();
  }

  /** Register a callback invoked with (width, height) after every resize. */
  onResize(callback) {
    this.resizeCallbacks.push(callback);
  }

  /** Re-read container size and pixel-ratio policy; notify subscribers. */
  applySize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return; // panel hidden below `lg` breakpoint

    this.renderer.setPixelRatio(this.quality.effectivePixelRatio);
    this.renderer.setSize(width, height);
    for (const callback of this.resizeCallbacks) callback(width, height);
  }

  /** Drawing-buffer height in device pixels (point-size attenuation input). */
  getDrawingBufferHeight() {
    return this.renderer.domElement.height;
  }

  /** Re-read live renderer values from Settings (dev-panel hook). */
  applyRendererSettings() {
    this.renderer.toneMapping = TONE_MAPPING[Settings.renderer.toneMapping] ?? ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = Settings.renderer.toneMappingExposure;
  }

  /**
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   */
  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  /** Release the GL context and observers. */
  dispose() {
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.applySize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
