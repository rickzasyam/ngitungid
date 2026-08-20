/**
 * Settings — the single source of truth for every tunable value in the engine.
 *
 * Purpose:          Centralize all "magic numbers" so tuning never requires
 *                   touching engine code, and so the dev panel (`?dev`,
 *                   Tweakpane) can bind directly to this object.
 * Responsibilities: Hold configuration only. No logic, no derived state.
 * Dependencies:     None.
 *
 * Conventions:
 * - Damping values are per-second decay rates (λ) consumed by
 *   `MathUtils.damp()`. Legacy per-frame lerp factors tuned at 60 FPS were
 *   converted with λ = -ln(1 - k) * 60 to preserve the exact feel:
 *     0.045/frame → λ ≈ 2.8   |   0.08/frame → λ ≈ 5.0   |   0.15/frame → λ ≈ 9.8
 * - Colors are sRGB hex strings; three.js color management converts them to
 *   the linear working space automatically.
 * - World frame: the terrain spans ±(cols·spacing)/2 on x/z; the camera sits
 *   at +z looking toward -z, so "background" means negative z.
 *
 * Treat this object as immutable at runtime. It is intentionally not frozen
 * so the dev-only tuning panel (`?dev`) can mutate it live.
 */
export const Settings = {
  camera: {
    // 43° — cinematic compression: stacks the ridge layers and removes the
    // wide-angle foreground stretch the legacy 75° produced.
    fov: 43,
    near: 0.1,
    far: 1000,
    // Owner-tuned framing: a low, close, off-centre camera aiming high — the
    // eye sits down among the ridges and looks up at them, which reads far more
    // dramatic than the earlier elevated overview.
    basePosition: { x: -2.0, y: 2.9, z: 9.7 },
    lookTarget: { x: 0.8, y: 3.5, z: 0 },
    parallax: {
      positionX: 1.6, // camera x offset at full pointer deflection (world units)
      positionY: 0.8,
      lookX: 1.1, // look-target x offset at full pointer deflection
      lookY: 0.6,
      damping: 4.0, // λ — snappier pointer follow than the legacy 0.045/frame
    },
    // Idle drift: the camera floats on two incommensurate sine pairs so the
    // scene is alive even without a pointer. Amplitudes in world units;
    // frequencies in rad/s (periods ≈ 30 s and 134 s — calm, never looping
    // perceptibly).
    drift: {
      amplitudeX: 0.3,
      amplitudeY: 0.18,
      frequencyA: 0.21,
      frequencyB: 0.047,
    },
  },

  renderer: {
    // Tone-mapping operator: 'aces' | 'agx' | 'neutral' | 'none'. Compared
    // A/B during M4 grading; ACES chosen — it keeps the lime accent liveliest
    // while still rolling highlights off filmically. AgX desaturated the brand
    // green too far toward neutral; Neutral clipped peaks harder.
    toneMapping: 'aces',
    toneMappingExposure: 1.15, // tuned through ACES — keeps lime lively without clipping
    // Transparent canvas: the page's dark surface color shows through,
    // keeping page background ownership in CSS where it belongs.
    clearAlpha: 0,
  },

  terrain: {
    // Identical seed ⇒ identical terrain on every reload (tuning requires
    // that a parameter change be the only difference between two runs).
    seed: 42391,

    grid: {
      // Base grid — this IS the hero (foreground) layer's density, since that
      // layer inherits rather than overriding it. 320×300 = 96k particles,
      // affordable since M2 moved displacement to the GPU (per-frame cost no
      // longer scales with count). QualityManager's particleBudget scales this
      // down on weaker tiers.
      cols: 320,
      rows: 300,
      spacing: 0.05, // world units between particles → 16×15-unit field
      // Per-particle position jitter as a fraction of spacing (0 = exact
      // grid). Breaks the mechanical dot-matrix reading into an organic
      // point field while preserving overall density.
      jitter: 0.5,
    },

    // ---- Noise character (consumed by NoiseField) -------------------------
    noise: {
      lacunarity: 2.0, // frequency multiplier per octave
      gain: 0.5, // amplitude multiplier per octave
      octaveRotation: 0.6, // radians per octave — breaks lattice axis bias
      ridge: {
        scale: 0.12, // ridge frequency — fewer, larger mountains read grander
        octaves: 7, // more octaves — finer erosion detail on the crests
        offset: 1.0, // ridged-multifractal fold offset
        // Lower feedback spreads detail off the crests, which keeps the
        // higher `sharpness` below from reading as bare needles.
        weightFeedback: 0.5,
        // Crest exponent: 2 = needle-sharp alpine spires, 1 = soft folds.
        sharpness: 2.25,
      },
      envelope: {
        scale: 0.05, // macro mask deciding where mountain mass appears
        octaves: 3,
      },
      micro: {
        scale: 0.9, // fine surface detail frequency
        octaves: 2,
        amplitude: 0.18, // world units
      },
      warp: {
        scale: 0.235, // frequency of the warp field
        octaves: 3,
        strength: 1.8, // world-unit displacement — the "organic" dial
      },
    },

    // ---- Art direction (consumed by Composition) --------------------------
    composition: {
      peakHeight: 6.1, // maximum ridge contribution (world units)
      envelopeFloor: 0.25, // minimum envelope influence so ridges never vanish
      envelopeGain: 0.9, // how strongly the envelope modulates ridge height
      backdrop: {
        lift: 2.2, // background massif height (world units)
        nearZ: 3.0, // where the ramp starts
        farZ: -6.5, // where it reaches full lift
        // Envelope modulation of the massif height: makes the far silhouette
        // rise and fall organically instead of showing the ridge noise's
        // even scallop rhythm.
        variationBase: 0.4,
        variationGain: 1.2,
      },
      midRidge: {
        centerZ: -1.5, // mid-ground silhouette band position
        width: 2.0,
        lift: 1.0,
      },
      centerFill: {
        x: 0.6, // slightly offset from true center — organic, not planted
        z: -0.8,
        radius: 1.9,
        lift: 0.8,
      },
      baseline: 1.35, // global offset pulling valley floors below y = 0
    },
  },

  particles: {
    size: 0.058, // world-unit point size (perspective attenuation in shader)
    sizeVariation: 0.5, // ± per-particle size jitter (organic, non-uniform field)
    sizeAltitudeBoost: 0.95, // peaks render noticeably larger than valley dust
    sizeMaxPx: 6, // hard pixel cap — near particles never balloon into blobs
    // WARNA — SATU-SATUNYA hal yang diubah dari prototipe.
    // Lembah: relasi terhadap kanvas dipertahankan persis (delta +13/+15/+15
    // dari latar halaman), sekarang diturunkan dari #222124, bukan #0c0e10.
    colorLow: '#2f3033', // valley color — a breath above the page surface
    colorHigh: '#daf163', // lime token NgitungID (dulu #d8ff75)
    colorGamma: 2.2, // pow() curve confining lime to the upper peaks
  },

  environment: {
    // Exponential-squared depth fog, computed in the particle shader.
    // Color matches the page background so far particles dissolve into it.
    fogColor: '#222124', // = kanvas app (dulu #0c0e10)
    fogDensity: 0.036,
    // Near-plane dissolve (view-space depth): particles closer than
    // nearFadeEnd fade toward invisible at nearFadeStart.
    nearFadeStart: 6.25,
    nearFadeEnd: 8.0,

    // ---- Depth color grading (M4) -----------------------------------------
    // Distant particles lose saturation and cool slightly BEFORE fog is
    // applied, so depth reads through color, not opacity alone. All in the
    // fragment shader; view-space depth in world units.
    depthGrade: {
      start: 9.0, // depth where grading begins
      end: 26.0, // depth of full grading
      desaturate: 0.5, // how far distant particles pull toward grayscale
    },
    // Cool tint multiplier applied to fully-graded (distant) particles — a
    // restrained atmospheric blue-shift + dim. Kept close to white so the
    // brand palette is nudged, not recolored.
    coolTint: '#c2d4de',

    // ---- Depth layers (M4) ------------------------------------------------
    // Overlapping silhouettes at staggered depths. Layer 0 is the interactive
    // hero terrain; deeper layers are non-interactive skyline bands, thinner
    // (fewer rows), raised so their ridgelines crest above nearer layers, and
    // pushed into fog + depth grading by their real z position.
    //   seedOffset   — decorrelates each layer's noise identity
    //   zOffset      — world-space push into the distance (negative = far)
    //   heightScale  — ridge amplitude multiplier
    //   baselineLift — raises the whole layer so its skyline clears the front
    //   sizeScale    — particle size multiplier (distant = smaller dust)
    //   tint         — per-layer color multiplier (dim/cool distant bands)
    //   interactive  — receives cursor dome + ripples (front layer only)
    layers: [
      {
        name: 'foreground',
        seedOffset: 0,
        zOffset: 0,
        // cols/rows intentionally omitted: the hero layer IS the base grid, so
        // it inherits `terrain.grid`. Declaring them here would shadow the base
        // grid and silently render that setting inert.
        heightScale: 1.0,
        baselineLift: 0,
        sizeScale: 1.0,
        tint: '#ffffff',
        interactive: true,
      },
      {
        name: 'midground',
        seedOffset: 1301,
        zOffset: -7.0,
        cols: 300,
        rows: 150,
        heightScale: 0.92,
        baselineLift: 1.5,
        sizeScale: 0.85,
        tint: '#cfe0e8',
        interactive: false,
      },
      {
        name: 'background',
        seedOffset: 2609,
        zOffset: -12.5,
        cols: 280,
        rows: 120,
        heightScale: 0.78,
        baselineLift: 3.7,
        sizeScale: 0.72,
        tint: '#c2d6e2',
        interactive: false,
      },
    ],

    // ---- Backdrop (M4, CSS — zero GPU cost) -------------------------------
    // A radial gradient behind the transparent canvas and a restrained corner
    // vignette above it. Owned by environment/Backdrop.js.
    backdrop: {
      // Warm amber horizon glow against the cool particle grade — the
      // complementary contrast that gives the frame its dusk feel.
      glowColor: '#3f3933', // atmospheric lift — delta +29/+24/+15 dari kanvas
      baseColor: '#222124', // mid field — = kanvas app
      edgeColor: '#1d1c1e', // outer falloff — delta -5/-5/-6 dari kanvas
      glowX: 50, // horizon glow center, % of width
      glowY: 0, // % of height — glow sits at the very top of the frame
      vignetteStrength: 0.32, // corner darkening opacity (0 = off)
    },
  },

  interaction: {
    influenceRadius: 2.6, // world-unit radius of the hover dome
    liftAmount: 1.0, // dome lift at cursor center (was 1.5 — audit: exaggerated)
    // Height of the cursor projection plane. The legacy plane sat at y = 0
    // while ridges reach ~6, so the perceived cursor position drifted off the
    // mountains at glancing angles; mean visible terrain height works better.
    planeHeight: 1.2,
    cursorDamping: 5.0, // λ — smoothing of the projected cursor point
    // Fade rate of interaction presence when the pointer leaves the window.
    presenceDamping: 4.0,
    // Impulse ripples (M3): discrete wavefronts spawned by pointer movement
    // that expand, decay and settle — replaces the legacy standing sine wave.
    // Pool size is fixed at 4 (RIPPLE_COUNT in the ParticleMaterial shader).
    ripples: {
      speed: 2.4, // wavefront expansion, world units / s
      width: 0.55, // gaussian ring width, world units
      decay: 1.7, // amplitude decay rate, 1/s — the "settling"
      amplitude: 0.32, // world-unit height of a fresh wavefront
      spawnDistance: 0.9, // pointer travel required to launch a new ripple
      minInterval: 0.15, // s — spawn rate limit
    },
  },

  animation: {
    breathing: {
      amplitude: 0.08, // idle vertical oscillation (world units)
      speed: 0.7, // radians per second
    },
    heightDamping: 9.8, // λ — particle y approach to target (legacy 0.15/frame)
    maxDeltaTime: 1 / 20, // dt clamp — prevents a physics jump after tab switches
  },

  // Runtime performance watchdog (QualityManager). Steps render resolution
  // DOWN only when the frame rate is sustainedly low — never up. Downgrades
  // are far less noticeable than oscillation between quality levels, so this
  // is deliberately one-way (hysteresis by design).
  performance: {
    targetFps: 50, // sustained frame rate below this triggers a downgrade
    warmupSeconds: 1.5, // ignore the first frames (shader compile, fps ramp)
    sustainSeconds: 2.0, // how long below target before stepping down
    downgradeFactor: 0.85, // render-scale multiplier per step
    minRuntimeScale: 0.6, // resolution floor — never blur below this
    cooldownSeconds: 3.0, // settle time between successive downgrades
  },
};
