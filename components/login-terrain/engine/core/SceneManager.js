/**
 * SceneManager — owns the three.js scene graph root.
 *
 * Purpose:          Create and expose the Scene; provide controlled add/remove.
 * Responsibilities: Scene ownership only. Environment concerns (fog, background
 *                   treatment, atmosphere) attach here in M4 per the roadmap.
 * Dependencies:     three (Scene).
 * Performance:      Construction only; no per-frame work.
 */
import { Scene } from 'three';

export class SceneManager {
  constructor() {
    this.scene = new Scene();
    // Background stays null: the canvas is transparent (clearAlpha 0) and the
    // page's dark surface color shows through — background ownership lives in
    // CSS with the rest of the layout.
  }

  /** @param {import('three').Object3D} object */
  add(object) {
    this.scene.add(object);
  }

  /** @param {import('three').Object3D} object */
  remove(object) {
    this.scene.remove(object);
  }
}
