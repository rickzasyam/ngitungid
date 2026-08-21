/**
 * ParticleMaterial — the GPU particle shader (M2 keystone).
 *
 * Purpose:          All per-particle animation and shading on the GPU:
 *                   breathing, cursor lift/ripple, dynamic point sizing,
 *                   altitude color ramp, analytic anti-aliased disc, and
 *                   exponential depth fog.
 * Responsibilities: Shader source + uniform schema + Settings→uniform sync.
 *                   Geometry/attribute ownership stays in ParticleSystem.
 * Dependencies:     Settings, three.
 *
 * Performance design (why this replaces the CPU path):
 * - Base positions are static GPU memory; displacement is recomputed per
 *   vertex per frame on hardware built for exactly that. Per-frame CPU cost
 *   drops from a 57k-iteration loop + ~675 KB buffer upload to ~4 uniform
 *   writes, independent of particle count.
 * - The disc is analytic (smoothstep ring in point-coord space, edge width
 *   derived from the point's own pixel size — resolution-independent AA with
 *   no derivatives extension and no texture fetch). Sharp particles, minimal
 *   glow, per DESIGN.MD — this deliberately retires the additive-blending
 *   soft-sprite look.
 * - Normal (non-additive) blending needs back-to-front order: the terrain
 *   grid is generated far-z → near-z and the camera always sits at +z, so
 *   buffer order IS painter's order by construction (documented invariant,
 *   see TerrainGenerator).
 *
 * Color pipeline: colors are supplied in linear working space; the fragment
 * shader ends with three's tone-mapping + output-colorspace chunks so ACES
 * grading applies exactly as it does to built-in materials.
 */
import { Color, NormalBlending, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { Settings } from '../config/Settings.js';

const VERTEX_SHADER = /* glsl */ `
  attribute float aAltitude; // normalized terrain altitude [0, 1]
  attribute float aSeed;     // per-particle random [0, 1)

  uniform float uTime;
  uniform float uScale;             // 0.5 * drawing-buffer height (px)
  uniform float uSize;              // world-space particle size
  uniform float uSizeVariation;     // ± fraction of size from aSeed
  uniform float uSizeAltitudeBoost; // extra size at peaks
  uniform float uSizeMaxPx;         // hard cap in device px — near particles
                                    // must never balloon into blobs
  uniform vec2  uBreathing;         // x: amplitude, y: speed
  uniform vec2  uCursor;            // smoothed cursor, world xz
  uniform float uCursorStrength;    // interaction presence [0, 1]
  uniform float uInfluenceRadius;
  uniform float uLiftAmount;
  // Impulse ripple pool: (originX, originZ, startTime, amplitude) per slot.
  // Inactive slots carry amplitude 0. Fixed pool size — a uniform array, not
  // a per-frame allocation.
  #define RIPPLE_COUNT 8
  uniform vec4  uRipples[RIPPLE_COUNT];
  uniform vec3  uRippleShape;       // x: speed, y: ring width, z: decay rate
  uniform vec3  uColorLow;
  uniform vec3  uColorHigh;
  uniform float uColorGamma;
  uniform vec3  uLayerTint; // per-layer color multiplier (dim/cool distant bands)

  varying vec3  vColor;
  varying float vDepth;
  varying float vPointSize;

  const float TWO_PI = 6.28318530718;

  void main() {
    // Idle breathing — phase from the particle's seed.
    float breathe = sin(uTime * uBreathing.y + aSeed * TWO_PI) * uBreathing.x;

    // Hover dome: a soft radial lift that follows the smoothed cursor and
    // fades with interaction presence.
    vec2 toCursor = position.xz - uCursor;
    float dist = length(toCursor);
    float norm = clamp(1.0 - dist / uInfluenceRadius, 0.0, 1.0);
    float influence = norm * norm * (3.0 - 2.0 * norm);
    float dome = influence * uLiftAmount * uCursorStrength;

    // Impulse ripples: each active slot is an expanding Ricker-wavelet ring
    // (crest with leading/trailing dips — anticipation, motion, settling)
    // whose amplitude decays exponentially with age. Ripples deliberately do
    // NOT fade with cursor presence: a launched wave keeps propagating after
    // the pointer leaves.
    float rippleLift = 0.0;
    for (int i = 0; i < RIPPLE_COUNT; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      float liveness = step(0.0, age) * step(0.0001, r.w); // 'active' is reserved in GLSL ES
      float ring = (distance(position.xz, r.xy) - age * uRippleShape.x) / uRippleShape.y;
      float wavelet = (1.0 - ring * ring) * exp(-0.5 * ring * ring);
      rippleLift += liveness * r.w * wavelet * exp(-age * uRippleShape.z);
    }

    vec3 displaced = vec3(position.x, position.y + breathe + dome + rippleLift, position.z);
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Dynamic size: seeded jitter × altitude boost × perspective attenuation
    // (same attenuation formula as three's PointsMaterial).
    float jitter = 1.0 + (fract(aSeed * 7.13) - 0.5) * 2.0 * uSizeVariation;
    float altitudeBoost = 1.0 + aAltitude * uSizeAltitudeBoost;
    float pointSize = uSize * jitter * altitudeBoost * (uScale / -mvPosition.z);
    pointSize = min(pointSize, uSizeMaxPx);
    gl_PointSize = pointSize;

    vColor = mix(uColorLow, uColorHigh, pow(aAltitude, uColorGamma)) * uLayerTint;
    vDepth = -mvPosition.z;
    vPointSize = pointSize;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3  uFogColor;
  uniform float uFogDensity;
  uniform vec2  uNearFade;   // x: fully-faded depth, y: fully-visible depth
  uniform vec3  uDepthGrade; // x: start depth, y: end depth, z: desaturate amount
  uniform vec3  uCoolTint;   // atmospheric tint multiplier for distant particles

  varying vec3  vColor;
  varying float vDepth;
  varying float vPointSize;

  void main() {
    // Analytic disc: ~1.5px anti-aliased rim scaled to this point's size —
    // sharp at any resolution, no texture, no glow halo.
    float d = length(gl_PointCoord - vec2(0.5));
    float edge = clamp(1.5 / max(vPointSize, 1.0), 0.03, 0.5);
    float alpha = 1.0 - smoothstep(0.5 - edge, 0.5, d);
    if (alpha < 0.01) discard;

    // Near-plane dissolve: particles approaching the camera fade out instead
    // of ballooning across the frame — cinematic instead of chaotic.
    alpha *= smoothstep(uNearFade.x, uNearFade.y, vDepth);

    // Depth color grading (before fog): distant particles lose saturation and
    // take a cool atmospheric tint, so depth reads through hue and not just
    // fog opacity — the difference between a flat field and real aerial depth.
    float depthT = smoothstep(uDepthGrade.x, uDepthGrade.y, vDepth);
    float luma = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
    vec3 graded = mix(vColor, vec3(luma), depthT * uDepthGrade.z);
    graded = mix(graded, graded * uCoolTint, depthT);

    // Exponential-squared depth fog toward the page background color —
    // far particles dissolve into atmosphere.
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
    vec3 color = mix(graded, uFogColor, fog);

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Create the particle ShaderMaterial with uniforms synced from Settings. */
export function createParticleMaterial() {
  const material = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1 },
      uCursor: { value: new Vector2(9999, 9999) },
      uCursorStrength: { value: 0 },
      uSize: { value: 1 },
      uSizeVariation: { value: 0 },
      uSizeAltitudeBoost: { value: 0 },
      uSizeMaxPx: { value: 16 },
      uNearFade: { value: new Vector2(0, 0.0001) },
      uBreathing: { value: new Vector2() },
      uInfluenceRadius: { value: 1 },
      uLiftAmount: { value: 0 },
      // Slots start inactive: amplitude 0, startTime far in the past.
      //
      // Pool DIPERBESAR 4 -> 8 (deviasi sadar dari prototipe). Dengan 4 slot
      // dan laju spawn maksimum 6,67/detik (minInterval 0,15s), sebuah slot
      // dipakai ulang tiap 0,60s — saat ripple lamanya MASIH 36% amplitudo
      // (decay 1,7/s). Penimpaan itu memotong gelombang dalam satu frame,
      // ~6,7 kali per detik: persis rasa "patah-patah" yang dilaporkan.
      // Dengan 8 slot siklusnya jadi 1,20s → tersisa ~13% saat ditimpa.
      // Panjang array ini HARUS sama dengan RIPPLE_COUNT di shader.
      uRipples: {
        value: [
          new Vector4(0, 0, -1e3, 0),
          new Vector4(0, 0, -1e3, 0),
          new Vector4(0, 0, -1e3, 0),
          new Vector4(0, 0, -1e3, 0),
          new Vector4(0, 0, -1e3, 0),
          new Vector4(0, 0, -1e3, 0),
          new Vector4(0, 0, -1e3, 0),
          new Vector4(0, 0, -1e3, 0),
        ],
      },
      uRippleShape: { value: new Vector3() },
      uColorLow: { value: new Color() },
      uColorHigh: { value: new Color() },
      uColorGamma: { value: 1 },
      uLayerTint: { value: new Color(0xffffff) }, // per-layer, set by ParticleSystem
      uFogColor: { value: new Color() },
      uFogDensity: { value: 0 },
      uDepthGrade: { value: new Vector3() },
      uCoolTint: { value: new Color(0xffffff) },
    },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
  syncParticleUniforms(material);
  return material;
}

/**
 * Push all Settings-derived values into uniforms. Called at init and by the
 * dev panel after live edits; never per frame (per-frame uniforms are uTime,
 * uCursor, uCursorStrength only).
 */
export function syncParticleUniforms(material) {
  const u = material.uniforms;
  const p = Settings.particles;
  const i = Settings.interaction;
  const b = Settings.animation.breathing;
  const e = Settings.environment;

  u.uSize.value = p.size;
  u.uSizeVariation.value = p.sizeVariation;
  u.uSizeAltitudeBoost.value = p.sizeAltitudeBoost;
  u.uSizeMaxPx.value = p.sizeMaxPx;
  u.uNearFade.value.set(e.nearFadeStart, e.nearFadeEnd);
  u.uColorLow.value.set(p.colorLow);
  u.uColorHigh.value.set(p.colorHigh);
  u.uColorGamma.value = p.colorGamma;
  u.uBreathing.value.set(b.amplitude, b.speed);
  u.uInfluenceRadius.value = i.influenceRadius;
  u.uLiftAmount.value = i.liftAmount;
  u.uRippleShape.value.set(i.ripples.speed, i.ripples.width, i.ripples.decay);
  u.uFogColor.value.set(e.fogColor);
  u.uFogDensity.value = e.fogDensity;
  u.uDepthGrade.value.set(e.depthGrade.start, e.depthGrade.end, e.depthGrade.desaturate);
  u.uCoolTint.value.set(e.coolTint);
  // uLayerTint is deliberately NOT set here — it is per-layer state owned by
  // ParticleSystem (a global sync must not clobber a layer's tint).
}
