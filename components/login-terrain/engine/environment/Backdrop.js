/**
 * Backdrop — the atmospheric background and vignette behind the particles.
 *
 * Purpose:          A radial gradient behind the transparent canvas and a
 *                   restrained corner vignette in front of it — the depth cues
 *                   that sit outside the particle field itself.
 * Responsibilities: Compose two CSS layers on the scene container. No WebGL.
 * Dependencies:     Settings.
 *
 * Why CSS, not GL: this is flat compositing. A gradient plane or an
 * EffectComposer vignette pass would cost fill-rate and (per the M4 tech
 * evaluation) forfeit free MSAA, to reproduce exactly what two CSS layers give
 * for zero GPU cost. The canvas is transparent, so the gradient shows through
 * behind the particles; the vignette is a non-interactive overlay above the
 * canvas but below the login content (z-10 < the content's z-20).
 *
 * Both layers are decorative and marked aria-hidden.
 */
import { Settings } from '../config/Settings.js';

export class Backdrop {
  /** @param {HTMLElement} container the scene mount (#terrain-scene). */
  constructor(container) {
    this.container = container;

    this.vignette = document.createElement('div');
    this.vignette.setAttribute('aria-hidden', 'true');
    this.vignette.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:10;';
    container.appendChild(this.vignette);

    this.apply();
  }

  /** Rebuild both CSS layers from Settings (called on init and dev edits). */
  apply() {
    const b = Settings.environment.backdrop;

    this.container.style.backgroundColor = b.baseColor;
    this.container.style.backgroundImage =
      `radial-gradient(120% 95% at ${b.glowX}% ${b.glowY}%, ` +
      `${b.glowColor} 0%, ${b.baseColor} 55%, ${b.edgeColor} 100%)`;

    const v = b.vignetteStrength;
    this.vignette.style.background =
      `radial-gradient(130% 105% at 50% 42%, ` +
      `rgba(0,0,0,0) 55%, rgba(0,0,0,${v}) 100%)`;
  }

  /** Remove the vignette overlay (background style is left on the container). */
  dispose() {
    this.vignette.remove();
  }
}
