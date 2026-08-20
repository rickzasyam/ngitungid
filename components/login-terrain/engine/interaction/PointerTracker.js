/**
 * PointerTracker — translates DOM pointer events into engine pointer state.
 *
 * Purpose:          Provide normalized device coordinates plus a damped
 *                   "presence" strength: 1 while a pointer is active, easing
 *                   to 0 when it leaves the window or a touch ends.
 * Responsibilities: DOM event handling and pointer state only. World-space
 *                   projection lives in CursorProjector.
 * Dependencies:     Settings, MathUtils.
 * Performance:      Event handlers store scalars only; `update()` damps one
 *                   number. `getBoundingClientRect` per move matches legacy
 *                   behavior and is negligible on a static layout.
 *
 * Fixes over legacy: the old implementation set `hasPointer = true` forever,
 * so the terrain stayed lifted at the last cursor position after the mouse
 * left the window (and permanently after any touch). Presence now fades out,
 * letting the terrain settle organically.
 */
import { Settings } from '../config/Settings.js';
import { clamp, damp } from '../utils/MathUtils.js';

/**
 * Pointer events are window-wide but NDC is relative to the scene container,
 * so coordinates over the form panel exceed [-1, 1]. A mild clamp keeps
 * parallax bounded without a hard stop at the panel edge.
 */
const NDC_LIMIT = 1.2;

export class PointerTracker {
  /** @param {HTMLElement} element reference frame for NDC mapping (scene container) */
  constructor(element) {
    this.element = element;
    this.ndcX = 0;
    this.ndcY = 0;
    this.active = false; // pointer currently engaged
    this.hasSignal = false; // a pointer has been seen at least once
    this.strength = 0; // damped presence ∈ [0, 1]

    this.onPointerMove = (event) => {
      this.setFromClient(event.clientX, event.clientY);
    };
    this.onPointerUp = (event) => {
      // A lifted finger ends the interaction; a released mouse button does not.
      if (event.pointerType !== 'mouse') this.active = false;
    };
    this.onLeave = () => {
      this.active = false;
    };

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    window.addEventListener('blur', this.onLeave);
    document.documentElement.addEventListener('mouseleave', this.onLeave);
  }

  /** Map client coordinates to NDC relative to the scene container. */
  setFromClient(clientX, clientY) {
    const rect = this.element.getBoundingClientRect();
    this.ndcX = clamp(((clientX - rect.left) / rect.width) * 2 - 1, -NDC_LIMIT, NDC_LIMIT);
    this.ndcY = clamp(-((clientY - rect.top) / rect.height) * 2 + 1, -NDC_LIMIT, NDC_LIMIT);
    this.active = true;
    this.hasSignal = true;
  }

  /** Advance presence damping by one frame. */
  update(deltaTime) {
    this.strength = damp(
      this.strength,
      this.active ? 1 : 0,
      Settings.interaction.presenceDamping,
      deltaTime,
    );
  }

  /** Remove all DOM listeners. */
  dispose() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('blur', this.onLeave);
    document.documentElement.removeEventListener('mouseleave', this.onLeave);
  }
}
