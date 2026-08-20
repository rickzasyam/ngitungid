/**
 * CameraManager — owns all camera state and motion.
 *
 * Purpose:          Base pose, pointer parallax, look-target smoothing.
 * Responsibilities: Camera only. Pointer state is provided by interaction/;
 *                   this module never touches the DOM.
 * Dependencies:     Settings, MathUtils, three.
 * Performance:      All vectors preallocated in the constructor; `update()`
 *                   allocates nothing. Damping is frame-rate independent
 *                   (λ per second), so parallax feels identical at 60 and
 *                   144 Hz — the legacy per-frame lerp did not.
 *
 * M3 (per roadmap) adds idle drift and retunes FOV; the public interface
 * established here will not change.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { Settings } from '../config/Settings.js';
import { damp } from '../utils/MathUtils.js';

export class CameraManager {
  /** @param {number} aspect initial aspect ratio */
  constructor(aspect) {
    const s = Settings.camera;
    this.camera = new PerspectiveCamera(s.fov, aspect, s.near, s.far);
    this.basePosition = new Vector3(s.basePosition.x, s.basePosition.y, s.basePosition.z);
    this.lookTarget = new Vector3(s.lookTarget.x, s.lookTarget.y, s.lookTarget.z);

    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(this.lookTarget);
  }

  /** Keep projection in sync with the canvas. */
  setAspect(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Re-read pose/lens values from Settings (dev-panel / tuning hook). */
  applySettings() {
    const s = Settings.camera;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.basePosition.set(s.basePosition.x, s.basePosition.y, s.basePosition.z);
    // position/lookTarget converge to the new pose via the existing damping.
  }

  /**
   * Snap to the resting pose (no drift, no parallax). Used for the
   * reduced-motion static frame so the composition is centered and calm.
   */
  reset() {
    const s = Settings.camera;
    this.camera.position.copy(this.basePosition);
    this.lookTarget.set(s.lookTarget.x, s.lookTarget.y, s.lookTarget.z);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateMatrixWorld();
  }

  /**
   * Advance idle drift + parallax by one frame.
   *
   * Drift sums two incommensurate sines per axis (frequency ratios chosen so
   * the path never visibly repeats), with fixed phase/frequency offsets on y
   * so the vertical float is decorrelated from the horizontal. Time-based —
   * inherently frame-rate independent.
   *
   * @param {number} elapsed   seconds since loop start
   * @param {number} deltaTime seconds since last frame
   * @param {number} pointerX  pointer NDC x, pre-scaled by presence strength
   * @param {number} pointerY  pointer NDC y, pre-scaled by presence strength
   */
  update(elapsed, deltaTime, pointerX, pointerY) {
    const { parallax, lookTarget, drift } = Settings.camera;

    const driftX =
      (Math.sin(elapsed * drift.frequencyA) * 0.75 +
        Math.sin(elapsed * drift.frequencyB) * 0.25) *
      drift.amplitudeX;
    const driftY =
      (Math.sin(elapsed * drift.frequencyA * 0.83 + 1.7) * 0.6 +
        Math.sin(elapsed * drift.frequencyB * 1.31 + 4.2) * 0.4) *
      drift.amplitudeY;

    const targetX = this.basePosition.x + driftX + pointerX * parallax.positionX;
    const targetY = this.basePosition.y + driftY + pointerY * parallax.positionY;
    this.camera.position.x = damp(this.camera.position.x, targetX, parallax.damping, deltaTime);
    this.camera.position.y = damp(this.camera.position.y, targetY, parallax.damping, deltaTime);

    this.lookTarget.x = damp(this.lookTarget.x, pointerX * parallax.lookX, parallax.damping, deltaTime);
    this.lookTarget.y = damp(
      this.lookTarget.y,
      lookTarget.y - pointerY * parallax.lookY,
      parallax.damping,
      deltaTime,
    );
    this.camera.lookAt(this.lookTarget);
  }
}
