/**
 * Random — seeded pseudo-random number generation.
 *
 * Purpose:          Deterministic randomness so terrain, jitter and phases are
 *                   identical on every reload — essential for visual tuning
 *                   (a parameter change must be the only difference between
 *                   two reloads) and for reproducing reported issues.
 * Responsibilities: PRNG construction only.
 * Dependencies:     None.
 * Performance:      mulberry32 is a few integer ops per call; used only at
 *                   init time.
 */

/**
 * mulberry32 — small, high-quality 32-bit PRNG.
 * @param {number} seed
 * @returns {() => number} uniform float in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
