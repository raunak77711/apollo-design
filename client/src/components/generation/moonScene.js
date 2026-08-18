/**
 * Apollo's moon.
 *
 * A lit, textured, slowly turning 3D moon drifting through a sky — the thing
 * the user watches while Apollo builds their design.
 *
 * The geometry, the albedo and the relief are all from the project's own
 * Moon_3D_Model, baked to a compact runtime form by `scripts/bake-moon.mjs`
 * (3.9 MB of source → 235 KB of assets). What ships is the model's real
 * displaced sphere and its real crater map, not a sphere with a gradient on it.
 *
 * Written against raw WebGL rather than a 3D library on purpose: the whole
 * scene is one mesh, one fullscreen quad and two point sprites, which is far
 * less code than the integration layer for a renderer would be — and it keeps
 * a loading screen from adding half a megabyte of dependency to the bundle.
 *
 * Everything is drawn inside one opaque canvas: sky, glow, stars and moon.
 * Compositing additive light against a CSS backdrop is not expressible through
 * canvas alpha, so the sky lives in the shader where the maths works out.
 */

import meshUrl from '../../assets/moon/moon-mesh.bin?url';
import colorUrl from '../../assets/moon/moon-color.webp?url';
import heightUrl from '../../assets/moon/moon-height.webp?url';

/* ------------------------------ asset loading ----------------------------- */

let assetsPromise = null;

/**
 * Fetch and decode the moon once per session. Deliberately not called at module
 * scope: the import is dynamic, so nothing here costs anything until a
 * generation actually starts.
 */
export function loadMoonAssets() {
  if (!assetsPromise) {
    assetsPromise = Promise.all([
      fetch(meshUrl).then((res) => {
        if (!res.ok) throw new Error('moon mesh unavailable');
        return res.arrayBuffer();
      }),
      loadImage(colorUrl),
      loadImage(heightUrl),
    ])
      .then(([buffer, color, height]) => ({ mesh: parseMesh(buffer), color, height }))
      .catch((err) => {
        // A failed load must not poison every later attempt.
        assetsPromise = null;
        throw err;
      });
  }
  return assetsPromise;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}

/**
 * The baked mesh: a header, then quantised positions, uvs and normals, then
 * 16-bit indices. Every section is aligned to its element size, so these are
 * views onto the original buffer rather than copies.
 */
function parseMesh(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 7));
  if (magic !== 'APMOON1') throw new Error('unrecognised moon mesh');

  const vertexCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);

  let offset = 16;
  const positions = new Int16Array(buffer, offset, vertexCount * 3);
  offset += vertexCount * 6;
  const uvs = new Int16Array(buffer, offset, vertexCount * 2);
  offset += vertexCount * 4;
  const normals = new Int8Array(buffer, offset, vertexCount * 4);
  offset += vertexCount * 4;
  const indices = new Uint16Array(buffer, offset, indexCount);

  return { vertexCount, indexCount, positions, uvs, normals, indices };
}

/* -------------------------------- palettes -------------------------------- */

/**
 * Two scenes, designed separately rather than inverted.
 *
 * Night is the moon as the only light in the room: a deep indigo sky, a cold
 * key from the upper left, earthshine filling the dark limb, and a halo that
 * bleeds into the sky. Day is the moon you actually see at four in the
 * afternoon — pale, low-contrast, washed toward the sky by the air in front of
 * it, lit almost head-on so there is barely a terminator. Neither is the other
 * with the numbers flipped.
 */
const PALETTES = {
  dark: {
    skyTop: [0.036, 0.046, 0.084],
    skyBottom: [0.010, 0.012, 0.024],
    // Kept cool and modest: the sky lifting around the moon should read as
    // light in the air, not as a coloured ring drawn behind it.
    skyGlow: [0.052, 0.075, 0.150],
    haze: [0.13, 0.17, 0.34],
    hazeStrength: 0.42,
    light: [-0.55, 0.42, 0.72],
    keyColor: [1.0, 0.98, 0.93],
    keyStrength: 1.26,
    ambient: [0.10, 0.14, 0.29],
    ambientStrength: 0.44,
    wrap: 0.06,
    rimColor: [0.55, 0.68, 1.0],
    rimStrength: 0.3,
    rimPower: 3.4,
    glowColor: [0.60, 0.70, 0.98],
    glowStrength: 0.34,
    glowSize: 3.2,
    atmosphere: [0.0, 0.0, 0.0],
    atmosphereMix: 0.0,
    tint: [1.0, 0.99, 0.96],
    exposure: 1.06,
    stars: 1.15,
    motes: 0.4,
  },
  light: {
    skyTop: [0.34, 0.57, 0.86],
    skyBottom: [0.93, 0.93, 0.90],
    // A daytime moon does not glow. Almost nothing here — just enough warmth
    // for the sky to feel lit rather than painted.
    skyGlow: [0.05, 0.05, 0.045],
    haze: [1.0, 1.0, 1.0],
    hazeStrength: 0.62,
    light: [0.38, 0.46, 0.80],
    keyColor: [1.0, 0.99, 0.96],
    keyStrength: 0.92,
    ambient: [0.60, 0.70, 0.86],
    ambientStrength: 0.4,
    // A wide wrap is what makes a daytime moon read as flat and pale rather
    // than as a dramatically lit sphere pasted onto a blue sky.
    wrap: 0.55,
    rimColor: [1.0, 0.99, 0.96],
    rimStrength: 0.1,
    rimPower: 2.2,
    glowColor: [1.0, 0.99, 0.95],
    glowStrength: 0.07,
    glowSize: 2.1,
    // The air in front of the moon, which is most of why it looks washed out.
    atmosphere: [0.80, 0.86, 0.94],
    atmosphereMix: 0.15,
    tint: [1.0, 1.0, 1.0],
    exposure: 0.95,
    stars: 0.0,
    motes: 0.18,
  },
};

/* --------------------------------- shaders -------------------------------- */

/**
 * Sky. One fullscreen triangle: a vertical gradient, a soft bloom around the
 * moon's own position, and a handful of blurred blobs that read as cloud in
 * daylight and as high cloud or nebula at night. Analytic falloffs rather than
 * noise — a fraction of the cost, and far easier to art-direct.
 */
const SKY_VERT = `
attribute vec2 aCorner;
varying vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`;

const SKY_FRAG = `
precision mediump float;

varying vec2 vUv;

uniform vec2 uAspect;      // (aspect, 1.0) — keeps blobs circular
uniform float uTime;
uniform vec2 uMoon;        // moon centre, uv space
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uSkyGlow;
uniform vec3 uHaze;
uniform float uHazeStrength;
uniform float uVignette;
uniform float uFade;

float blob(vec2 p, vec2 centre, vec2 radius) {
  float d = length((p - centre) / radius);
  return smoothstep(1.0, 0.0, d);
}

void main() {
  vec2 p = vUv * uAspect;

  // Ground: a vertical gradient, warmed toward the horizon.
  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, vUv.y));

  // The moon lifts the sky immediately around it, which is what sells it as a
  // light source rather than a sticker.
  float halo = blob(p, uMoon * uAspect, vec2(0.62));
  sky += uSkyGlow * halo * 0.85;

  // Slow, drifting cloud. Each one is three offset blobs so the silhouette is
  // lumpy rather than round.
  float t = uTime * 0.012;
  float cloud = 0.0;
  vec2 a = vec2(fract(0.18 + t) * 1.9 - 0.45, 0.72);
  cloud += blob(p, a, vec2(0.30, 0.075)) * 0.8;
  cloud += blob(p, a + vec2(0.12, 0.028), vec2(0.19, 0.055)) * 0.7;
  cloud += blob(p, a - vec2(0.14, 0.016), vec2(0.22, 0.048)) * 0.6;

  vec2 b = vec2(fract(0.66 - t * 0.72) * 1.9 - 0.45, 0.30);
  cloud += blob(p, b, vec2(0.38, 0.088)) * 0.62;
  cloud += blob(p, b + vec2(-0.16, 0.032), vec2(0.24, 0.062)) * 0.5;

  vec2 c = vec2(fract(0.40 + t * 0.5) * 1.9 - 0.45, 0.94);
  cloud += blob(p, c, vec2(0.44, 0.10)) * 0.4;

  sky = mix(sky, uHaze, clamp(cloud, 0.0, 1.0) * uHazeStrength);

  // A gentle vignette keeps the eye on the moon and hides the canvas edges.
  // Held framings ask for much less of it: the page fades the sky out at the
  // foot itself, and darkening a pale daytime sky on the way there turns it
  // grey rather than atmospheric.
  float vignette = 1.0 - uVignette * pow(length((vUv - 0.5) * vec2(1.1, 1.0)) * 1.35, 2.2);
  gl_FragColor = vec4(sky * vignette * uFade, 1.0);
}`;

/** Stars and dust motes. Screen-space points with a soft radial falloff. */
const POINT_VERT = `
attribute vec3 aPoint;     // x, y in clip space · z = size seed
attribute vec2 aPhase;     // twinkle phase · brightness

varying float vAlpha;

uniform vec2 uDrift;
uniform float uTime;
uniform float uScale;
uniform float uIntensity;
uniform float uTwinkle;

void main() {
  vec2 pos = aPoint.xy + uDrift * (0.4 + aPoint.z);
  // Wrap rather than clamp, so a drifting field never thins out at an edge.
  pos = fract((pos + 1.0) * 0.5) * 2.0 - 1.0;

  float twinkle = mix(1.0, 0.55 + 0.45 * sin(uTime * 1.6 + aPhase.x * 6.28318), uTwinkle);
  vAlpha = aPhase.y * twinkle * uIntensity;

  gl_PointSize = (1.0 + aPoint.z * 3.2) * uScale;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const POINT_FRAG = `
precision mediump float;
varying float vAlpha;
uniform vec3 uColor;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float falloff = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(uColor * falloff * falloff * vAlpha, 1.0);
}`;

/** The halo, as a camera-facing quad behind the moon. */
const GLOW_VERT = `
attribute vec2 aCorner;
varying vec2 vLocal;

uniform mat4 uProjection;
uniform vec3 uCentre;
uniform float uSize;

void main() {
  vLocal = aCorner;
  gl_Position = uProjection * vec4(uCentre + vec3(aCorner * uSize, 0.0), 1.0);
}`;

const GLOW_FRAG = `
precision mediump float;
varying vec2 vLocal;

uniform vec3 uColor;
uniform float uStrength;

void main() {
  float d = length(vLocal);
  // Two falloffs stacked: a tight core that hugs the limb, and a wide bloom
  // that dissolves into the sky.
  float core = smoothstep(1.0, 0.12, d);
  float bloom = smoothstep(1.0, 0.0, d);
  float a = (core * core * 0.55 + bloom * bloom * bloom * 0.45) * uStrength;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

const MOON_VERT = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;

varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;

uniform mat4 uProjection;
uniform mat4 uModelView;
uniform mat3 uNormalMatrix;

void main() {
  vec4 viewPosition = uModelView * vec4(aPosition, 1.0);
  vNormal = uNormalMatrix * aNormal;
  vView = -viewPosition.xyz;
  vUv = aUv;
  gl_Position = uProjection * viewPosition;
}`;

const MOON_FRAG = `
precision mediump float;

varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;

uniform sampler2D uColor;
uniform sampler2D uHeight;
uniform vec2 uTexel;
// The moon's pole in view space. Passed in rather than derived from
// uNormalMatrix: a uniform shared between stages must agree on precision, and
// the vertex stage defaults to highp where this one is mediump.
uniform vec3 uPoleAxis;

uniform vec3 uLight;
uniform vec3 uKeyColor;
uniform float uKeyStrength;
uniform vec3 uAmbient;
uniform float uAmbientStrength;
uniform float uWrap;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimPower;
uniform vec3 uAtmosphere;
uniform float uAtmosphereMix;
uniform vec3 uTint;
uniform float uExposure;
uniform float uRelief;
uniform float uFade;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);

  /* Relief. The supplied map is a height field, so the gradient is taken here
     rather than baked to a normal map — four taps of one greyscale channel
     costs a fraction of what shipping an RGB normal map would have. */
  float hL = texture2D(uHeight, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture2D(uHeight, vUv + vec2(uTexel.x, 0.0)).r;
  float hN = texture2D(uHeight, vUv - vec2(0.0, uTexel.y)).r;
  float hS = texture2D(uHeight, vUv + vec2(0.0, uTexel.y)).r;

  // Tangent frame for an equirectangular sphere: east from the pole axis,
  // north from the surface normal. Degenerate at the poles, where the map is
  // smooth enough for it not to show.
  vec3 T = normalize(cross(uPoleAxis, N) + vec3(1e-5));
  vec3 B = cross(N, T);
  N = normalize(N - uRelief * ((hR - hL) * T - (hS - hN) * B));

  float albedo = texture2D(uColor, vUv).r;

  // Wrapped lambert. A tight wrap gives night its hard terminator; a wide one
  // is what flattens the daytime moon.
  float ndl = dot(N, normalize(uLight));
  float diffuse = clamp((ndl + uWrap) / (1.0 + uWrap), 0.0, 1.0);
  // Regolith backscatters — the moon is famously flat-looking near full, and
  // without this the limb darkens like a billiard ball.
  diffuse = pow(diffuse, 0.72);

  vec3 lit = albedo * (uKeyColor * diffuse * uKeyStrength + uAmbient * uAmbientStrength);

  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uRimPower);
  // The halo belongs on the lit limb, not all the way round the dark side.
  lit += uRimColor * rim * uRimStrength * (0.35 + 0.65 * smoothstep(-0.35, 0.5, ndl));

  lit = mix(lit, uAtmosphere, uAtmosphereMix);
  lit *= uTint * uExposure;

  // Filmic-ish shoulder: keeps the bright limb from clipping to flat white.
  lit = lit / (lit + 0.72) * 1.72;

  gl_FragColor = vec4(lit * uFade, 1.0);
}`;

/* ------------------------------- mat helpers ------------------------------ */

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

/** Model-view for a moon at `centre`, spun by `spin` about a tilted axis. */
function modelView(out, centre, spin, tilt, scale) {
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);

  // Rotate about Y (the moon's own day), then tilt the axis toward the camera.
  const m = [
    cs, 0, -ss,
    st * ss, ct, st * cs,
    ct * ss, -st, ct * cs,
  ];

  out[0] = m[0] * scale; out[1] = m[3] * scale; out[2] = m[6] * scale; out[3] = 0;
  out[4] = m[1] * scale; out[5] = m[4] * scale; out[6] = m[7] * scale; out[7] = 0;
  out[8] = m[2] * scale; out[9] = m[5] * scale; out[10] = m[8] * scale; out[11] = 0;
  out[12] = centre[0]; out[13] = centre[1]; out[14] = centre[2]; out[15] = 1;
  return out;
}

/** The rotation part, which is orthonormal here, so it doubles as the normal matrix. */
function normalMatrix(out, mv) {
  out[0] = mv[0]; out[1] = mv[1]; out[2] = mv[2];
  out[3] = mv[4]; out[4] = mv[5]; out[5] = mv[6];
  out[6] = mv[8]; out[7] = mv[9]; out[8] = mv[10];
  // The model-view carries the uniform scale; normals must not.
  const inv = 1 / (Math.hypot(out[0], out[1], out[2]) || 1);
  for (let i = 0; i < 9; i += 1) out[i] *= inv;
  return out;
}

/* --------------------------------- the scene ------------------------------ */

const FOV = 0.5; // ~29° — a long lens, so the moon reads as far away
const MAX_PIXELS = 2_600_000;
const STAR_COUNT = 340;
const MOTE_COUNT = 70;

/**
 * How the moon is framed.
 *
 * The same scene serves two very different jobs. While a design is generated
 * the moon is the only thing on screen and is free to wander it; on the
 * homepage it is the subject of a composition that also has to hold a headline
 * and a prompt box, so it is anchored where the layout left room for it and
 * given something to respond to.
 */
const FRAMINGS = {
  // Drifting: unanchored, and nothing on the page can address it.
  drift: {
    anchored: false,
    scale: 1,
    depth: -9.5,
    spin: 0.048,
    glow: 1,
    relief: 0.42,
    exposure: 1,
    vignette: 0.34,
    parallax: 0,
    approach: 0,
    lag: 0,
    focusKey: 0,
    focusGlow: 0,
    focusExposure: 0,
  },
  // Held: large enough to be the subject, cropped by the frame like a
  // photograph, and answering the pointer, the composer and the scroll.
  hero: {
    anchored: true,
    scale: 1.34,
    depth: -8.4,
    spin: 0.062,
    glow: 1.3,
    // Held, the moon is four times the size it is while drifting, and the same
    // numbers no longer read the same: the relief map has the resolution to
    // carry more at this scale, and a full-brightness disc this large flattens
    // into a white shape instead of a lit sphere.
    relief: 0.55,
    exposure: 0.93,
    vignette: 0.16,
    // How far the pointer may carry it, how much closer it comes when the
    // composer takes focus, and how far it sinks as the hero scrolls away.
    parallax: 0.34,
    approach: 0.66,
    lag: 1.15,
    // Focus is a lighting change, not only a move: the key lifts and the halo
    // opens, so Apollo reads as having woken up rather than as having zoomed.
    focusKey: 0.15,
    focusGlow: 0.6,
    focusExposure: 0.045,
  },
};

/**
 * Build the scene. Returns a handle the caller drives:
 *
 *   setTheme('dark' | 'light')   cross-fades the whole environment
 *   setFade(0..1)                master opacity, for entering and leaving
 *   setPointer(x, y)             -1..1 — parallax, eased over the next frames
 *   setFocus(0..1)               the page is being worked in; the moon leans in
 *   setLayout('beside'|'stacked') which composition the page is currently in
 *   setSetting(0..1)             how far the hero has been scrolled past
 *   setActive(boolean)           stop drawing entirely when off screen
 *   destroy()                    releases every GL object and stops the loop
 *
 * The interaction setters do nothing under the drifting framing, and the ones
 * that move the moon do nothing under reduced motion — a still composition
 * stays still even while the pointer crosses it.
 *
 * `onLost` fires if the GL context is lost, so the caller can drop to the
 * static fallback instead of showing a dead canvas.
 */
export function createMoonScene(
  canvas,
  assets,
  { theme = 'dark', reducedMotion = false, onLost, framing = 'drift' } = {}
) {
  const shot = FRAMINGS[framing] || FRAMINGS.drift;
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: true,
    depth: false, // a convex closed surface needs only back-face culling
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  /* ------------------------------- programs ------------------------------ */

  const sky = program(gl, SKY_VERT, SKY_FRAG, ['aCorner']);
  const points = program(gl, POINT_VERT, POINT_FRAG, ['aPoint', 'aPhase']);
  const glow = program(gl, GLOW_VERT, GLOW_FRAG, ['aCorner']);
  const moon = program(gl, MOON_VERT, MOON_FRAG, ['aPosition', 'aNormal', 'aUv']);
  if (!sky || !points || !glow || !moon) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }

  /* -------------------------------- buffers ------------------------------ */

  const quad = buffer(gl, gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
  const glowQuad = buffer(gl, gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));

  const stars = pointField(gl, STAR_COUNT, (rand) => [rand() * 0.7, 0.35 + rand() * 0.65]);
  const motes = pointField(gl, MOTE_COUNT, (rand) => [rand(), 0.18 + rand() * 0.3]);

  const { mesh } = assets;
  const positions = buffer(gl, gl.ARRAY_BUFFER, mesh.positions);
  const normals = buffer(gl, gl.ARRAY_BUFFER, mesh.normals);
  const uvs = buffer(gl, gl.ARRAY_BUFFER, mesh.uvs);
  const indices = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, mesh.indices);

  const colorTexture = texture(gl, assets.color, gl.REPEAT);
  const heightTexture = texture(gl, assets.height, gl.REPEAT);

  /* --------------------------------- state ------------------------------- */

  const attribute = attributeBinder(gl);
  const mv = new Float32Array(16);
  const nm = new Float32Array(9);
  let projection = perspective(FOV, 1, 0.1, 100);
  let width = 1;
  let height = 1;
  let aspect = 1;
  let dpr = 1;

  // `current` is eased toward `target` every frame, so it must own its arrays —
  // a shallow copy would write the eased values straight into PALETTES.
  let current = clonePalette(PALETTES[theme] || PALETTES.dark);
  let target = PALETTES[theme] || PALETTES.dark;
  let fade = 0;
  let frame = 0;
  let running = true;
  let start = 0;
  let elapsed = 0;
  let lastTime = 0;

  const centre = [0, 0, shot.depth];

  /* What the page is telling the moon. Each is a target the render loop eases
     toward, because pointer moves and scroll events both arrive far more often
     than frames — easing at the call site would only stutter. */
  const pointer = [0, 0];
  const pointerTarget = [0, 0];
  let focus = 0;
  let focusTarget = 0;
  let setting = 0;
  let settingTarget = 0;
  let active = true;
  // Which composition the page is laid out in. Told rather than guessed: the
  // canvas aspect and the page's breakpoint disagree on a tall wide window and
  // on a tablet held upright, and when they disagree the moon lands on the
  // type. Stacked until the page says otherwise, because that is the framing
  // that leaves room for everything.
  let layout = 'stacked';
  // Held framings shrink the moon to fit; see placeHeld.
  let drawScale = shot.scale;

  /** Restart the loop after anything that stopped it. */
  function wake() {
    if (running || !active) return;
    running = true;
    lastTime = 0;
    frame = requestAnimationFrame(render);
  }

  /* -------------------------------- sizing ------------------------------- */

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Two caps: the device ratio, and a total pixel budget so a 5K display
    // does not quietly ask for eight megapixels a frame.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budget = Math.sqrt(MAX_PIXELS / (rect.width * rect.height * dpr * dpr));
    if (budget < 1) dpr *= budget;

    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w === width && h === height) return;

    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    aspect = w / h;
    projection = perspective(FOV, aspect, 0.1, 100);
    gl.viewport(0, 0, w, h);
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  if (!observer) window.addEventListener('resize', resize);
  resize();

  /* ------------------------------ context loss --------------------------- */

  const onContextLost = (event) => {
    event.preventDefault();
    running = false;
    cancelAnimationFrame(frame);
    onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  /* ------------------------------- the loop ------------------------------ */

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  /**
   * Where the moon is at time `t` when it is free to wander.
   *
   * Two slow sine pairs at incommensurate rates, so the path never visibly
   * repeats, plus a drift in depth that reads as the moon passing nearer and
   * further. The amplitudes are small on purpose — the brief was floating, not
   * orbiting, and anything faster starts to compete with the status line for
   * attention.
   */
  function placeDrifting(t) {
    const wide = aspect > 1.5;
    centre[0] = Math.sin(t * 0.055) * (wide ? 1.5 : 0.62) + Math.sin(t * 0.021 + 1.3) * 0.4;
    centre[1] = Math.sin(t * 0.037 + 0.7) * 0.42 + Math.sin(t * 0.084) * 0.12;
    centre[2] = -9.5 + Math.sin(t * 0.029 + 2.1) * 0.9;
  }

  /**
   * Where the moon is when the composition is held.
   *
   * Two compositions, not one with a scale factor. Beside the type it is the
   * subject: right of centre, a little high, full size, cropped by the frame
   * like a photograph. Stacked above the type it is the sky the page begins
   * under, so it gives up more than half its size and sits high enough to leave
   * the headline a clear field.
   *
   * Over either, a bob slow enough to read as floating rather than as
   * animation, and then the three things the page is allowed to say: where the
   * pointer is, whether the composer has focus, and how far it has been
   * scrolled past.
   */
  function placeHeld(t) {
    // Measured at the anchor depth rather than the current one, so leaning in
    // toward the composer cannot also shift the moon across the frame.
    const halfHeight = -shot.depth * Math.tan(FOV / 2);
    const halfWidth = halfHeight * aspect;
    const beside = layout === 'beside';

    // Stacked, the moon is capped against the frame's height as well as its
    // width — the width alone would let a tall narrow frame grow a moon that
    // reaches the headline, and the height alone would let a wide short one.
    // The share is sized so the moon clears the header above it and the
    // headline below: a composition where the subject collides with the
    // navigation is a bad crop, not an immersive one.
    drawScale = beside ? shot.scale : Math.min(shot.scale, halfWidth * 0.74, halfHeight * 0.3);

    centre[0] = halfWidth * (beside ? 0.4 : 0.08) + Math.sin(t * 0.031) * 0.09 + pointer[0] * shot.parallax;
    centre[1] =
      halfHeight * (beside ? 0.15 : 0.55) +
      Math.sin(t * 0.047 + 1.1) * 0.06 -
      pointer[1] * shot.parallax * 0.5 -
      setting * shot.lag;
    centre[2] = shot.depth + focus * shot.approach;
  }

  const place = shot.anchored ? placeHeld : placeDrifting;

  function render(now) {
    if (!running) return;
    frame = requestAnimationFrame(render);

    if (!start) start = now;
    // A tab that was hidden must not fast-forward the moon across the sky when
    // it comes back; the clock only advances by plausible frame times.
    const delta = Math.min((now - (lastTime || now)) / 1000, 1 / 20);
    lastTime = now;
    elapsed += delta;

    // Everything the page said since the last frame, eased in one place.
    const settle = Math.min(1, delta * 4.5);
    pointer[0] += (pointerTarget[0] - pointer[0]) * settle;
    pointer[1] += (pointerTarget[1] - pointer[1]) * settle;
    focus += (focusTarget - focus) * Math.min(1, delta * 3.4);
    setting += (settingTarget - setting) * Math.min(1, delta * 7);

    const t = reducedMotion ? 6 : elapsed;
    place(t);
    lerpPalette(current, target, Math.min(1, delta * 3.2));

    /* sky */
    gl.disable(gl.BLEND);
    attribute.use(sky);
    attribute.bind(quad, sky.attributes.aCorner, 2, gl.FLOAT, false);
    gl.uniform2f(sky.uniforms.uAspect, aspect, 1);
    gl.uniform1f(sky.uniforms.uTime, reducedMotion ? 0 : elapsed);
    gl.uniform1f(sky.uniforms.uFade, fade);
    // The sky's bloom has to track the moon, so it is given the moon's own
    // projected position rather than a fixed point.
    gl.uniform2f(sky.uniforms.uMoon, 0.5 + centre[0] / (2 * -centre[2] * Math.tan(FOV / 2) * aspect), 0.5 + centre[1] / (2 * -centre[2] * Math.tan(FOV / 2)));
    gl.uniform3fv(sky.uniforms.uSkyTop, current.skyTop);
    gl.uniform3fv(sky.uniforms.uSkyBottom, current.skyBottom);
    gl.uniform3fv(sky.uniforms.uSkyGlow, current.skyGlow);
    gl.uniform3fv(sky.uniforms.uHaze, current.haze);
    gl.uniform1f(sky.uniforms.uHazeStrength, current.hazeStrength);
    gl.uniform1f(sky.uniforms.uVignette, shot.vignette);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* stars and motes — additive, so light only ever adds to the sky */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawPoints(stars, current.stars * fade, 0.75 * dpr, [0.86, 0.9, 1.0], reducedMotion ? 0 : 1, t * 0.004);
    drawPoints(motes, current.motes * fade, 2.1 * dpr, current.glowColor, reducedMotion ? 0 : 0.6, -t * 0.008);

    /* halo */
    attribute.use(glow);
    attribute.bind(glowQuad, glow.attributes.aCorner, 2, gl.FLOAT, false);
    gl.uniformMatrix4fv(glow.uniforms.uProjection, false, projection);
    gl.uniform3fv(glow.uniforms.uCentre, centre);
    // The halo is sized in world units, so it has to shrink with the moon or
    // it detaches from the limb on a narrow screen.
    gl.uniform1f(glow.uniforms.uSize, current.glowSize * shot.glow * (drawScale / shot.scale));
    gl.uniform3fv(glow.uniforms.uColor, current.glowColor);
    gl.uniform1f(glow.uniforms.uStrength, current.glowStrength * (1 + focus * shot.focusGlow) * fade);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /* moon */
    gl.disable(gl.BLEND);
    modelView(mv, centre, reducedMotion ? 0.9 : t * shot.spin, -0.22, drawScale);
    normalMatrix(nm, mv);

    attribute.use(moon);
    attribute.bind(positions, moon.attributes.aPosition, 3, gl.SHORT, true);
    attribute.bind(normals, moon.attributes.aNormal, 3, gl.BYTE, true, 4);
    attribute.bind(uvs, moon.attributes.aUv, 2, gl.SHORT, true);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);

    gl.uniformMatrix4fv(moon.uniforms.uProjection, false, projection);
    gl.uniformMatrix4fv(moon.uniforms.uModelView, false, mv);
    gl.uniformMatrix3fv(moon.uniforms.uNormalMatrix, false, nm);
    // nm · (0,1,0) — the matrix is column-major, so this is its second column.
    gl.uniform3f(moon.uniforms.uPoleAxis, nm[3], nm[4], nm[5]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    gl.uniform1i(moon.uniforms.uColor, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, heightTexture);
    gl.uniform1i(moon.uniforms.uHeight, 1);
    gl.uniform2f(moon.uniforms.uTexel, 1 / assets.height.width, 1 / assets.height.height);

    gl.uniform3fv(moon.uniforms.uLight, current.light);
    gl.uniform3fv(moon.uniforms.uKeyColor, current.keyColor);
    gl.uniform1f(moon.uniforms.uKeyStrength, current.keyStrength * (1 + focus * shot.focusKey));
    gl.uniform3fv(moon.uniforms.uAmbient, current.ambient);
    gl.uniform1f(moon.uniforms.uAmbientStrength, current.ambientStrength);
    gl.uniform1f(moon.uniforms.uWrap, current.wrap);
    gl.uniform3fv(moon.uniforms.uRimColor, current.rimColor);
    gl.uniform1f(moon.uniforms.uRimStrength, current.rimStrength);
    gl.uniform1f(moon.uniforms.uRimPower, current.rimPower);
    gl.uniform3fv(moon.uniforms.uAtmosphere, current.atmosphere);
    gl.uniform1f(moon.uniforms.uAtmosphereMix, current.atmosphereMix);
    gl.uniform3fv(moon.uniforms.uTint, current.tint);
    gl.uniform1f(moon.uniforms.uExposure, current.exposure * shot.exposure * (1 + focus * shot.focusExposure));
    gl.uniform1f(moon.uniforms.uRelief, shot.relief);
    gl.uniform1f(moon.uniforms.uFade, fade);

    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);

    // Reduced motion gets one composed frame, not a still of an animation:
    // the loop runs until the entrance fade completes, then stops.
    if (reducedMotion && fade >= 0.999) {
      running = false;
      cancelAnimationFrame(frame);
    }
  }

  function drawPoints(field, intensity, scale, color, twinkle, drift) {
    if (intensity <= 0.002) return;
    attribute.use(points);
    attribute.bind(field.position, points.attributes.aPoint, 3, gl.FLOAT, false);
    attribute.bind(field.phase, points.attributes.aPhase, 2, gl.FLOAT, false);
    gl.uniform2f(points.uniforms.uDrift, drift, drift * 0.35);
    gl.uniform1f(points.uniforms.uTime, elapsed);
    gl.uniform1f(points.uniforms.uScale, scale);
    gl.uniform1f(points.uniforms.uIntensity, intensity);
    gl.uniform1f(points.uniforms.uTwinkle, twinkle);
    gl.uniform3fv(points.uniforms.uColor, color);
    gl.drawArrays(gl.POINTS, 0, field.count);
  }

  frame = requestAnimationFrame(render);

  /* ------------------------------- the handle ---------------------------- */

  // A hidden tab must not keep a GPU busy drawing a moon nobody is looking at.
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
    } else if (running) {
      lastTime = 0;
      frame = requestAnimationFrame(render);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    setTheme(next) {
      target = PALETTES[next] || PALETTES.dark;
      if (!running) {
        // Reduced motion stopped the loop; a theme change still has to land,
        // and with no frames to ease across it lands immediately.
        current = clonePalette(target);
        wake();
      }
    },
    setFade(value) {
      fade = Math.max(0, Math.min(1, value));
      if (fade > 0) wake();
    },
    setPointer(x, y) {
      if (!shot.anchored || reducedMotion) return;
      pointerTarget[0] = Math.max(-1, Math.min(1, x));
      pointerTarget[1] = Math.max(-1, Math.min(1, y));
      wake();
    },
    setFocus(value) {
      if (!shot.anchored) return;
      focusTarget = Math.max(0, Math.min(1, value));
      // Reduced motion keeps the moon still but not unlit: with no frames to
      // ease across, the lighting change lands on the single frame that
      // follows rather than being dropped.
      if (reducedMotion) focus = focusTarget;
      wake();
    },
    setLayout(next) {
      if (!shot.anchored || layout === next) return;
      layout = next;
      wake();
    },
    setSetting(value) {
      if (!shot.anchored || reducedMotion) return;
      settingTarget = Math.max(0, Math.min(1, value));
      wake();
    },
    setActive(next) {
      if (active === next) return;
      active = next;
      if (next) {
        wake();
      } else {
        // Scrolled out of the frame. Nothing to draw, so nothing is drawn.
        running = false;
        cancelAnimationFrame(frame);
      }
    },
    destroy() {
      running = false;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);

      for (const b of [quad, glowQuad, positions, normals, uvs, indices, stars.position, stars.phase, motes.position, motes.phase]) {
        gl.deleteBuffer(b);
      }
      gl.deleteTexture(colorTexture);
      gl.deleteTexture(heightTexture);
      for (const p of [sky, points, glow, moon]) {
        gl.deleteProgram(p.program);
      }
      // Freeing the context outright is the only reliable way to hand the GPU
      // memory back promptly; browsers cap live contexts per page.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/* -------------------------------- GL plumbing ----------------------------- */

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (import.meta.env?.DEV) console.warn('[moon] shader failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Compile, link, and collect every attribute and uniform location up front —
 * `getUniformLocation` in a render loop is a needless synchronous lookup.
 */
function program(gl, vertexSource, fragmentSource, attributeNames) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;

  const handle = gl.createProgram();
  gl.attachShader(handle, vertex);
  gl.attachShader(handle, fragment);
  gl.linkProgram(handle);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
    if (import.meta.env?.DEV) console.warn('[moon] link failed:', gl.getProgramInfoLog(handle));
    gl.deleteProgram(handle);
    return null;
  }

  // Locations only. Attribute arrays are enabled per draw, not here: without
  // vertex array objects the enabled set is global state, so leaving one on
  // between programs points a live attribute at another program's buffer.
  const attributes = {};
  for (const name of attributeNames) attributes[name] = gl.getAttribLocation(handle, name);

  const uniforms = {};
  const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const { name } = gl.getActiveUniform(handle, i);
    uniforms[name] = gl.getUniformLocation(handle, name);
  }

  return { program: handle, attributes, uniforms };
}

function buffer(gl, target, data) {
  const handle = gl.createBuffer();
  gl.bindBuffer(target, handle);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return handle;
}

/**
 * Switch programs and clear the attribute state the previous one left behind.
 * Returns a `bind` for this program's attributes; nothing else may enable one.
 */
function attributeBinder(gl) {
  const enabled = new Set();

  return {
    use(p) {
      gl.useProgram(p.program);
      for (const location of enabled) gl.disableVertexAttribArray(location);
      enabled.clear();
    },
    bind(handle, location, size, type, normalized, stride = 0) {
      if (location < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, handle);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, type, normalized, stride, 0);
      enabled.add(location);
    },
  };
}

function texture(gl, image, wrap) {
  const handle = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  // Both maps are powers of two, so mipmaps are available — worth having, as
  // the moon shrinks and grows as it drifts in depth.
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Longitude wraps; latitude must not, or the poles bleed across each other.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return handle;
}

/** A deterministic scatter, so the sky is the same one every time. */
function pointField(gl, count, weight) {
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const position = new Float32Array(count * 3);
  const phase = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    position[i * 3] = rand() * 2 - 1;
    position[i * 3 + 1] = rand() * 2 - 1;
    const [size, brightness] = weight(rand);
    position[i * 3 + 2] = size;
    phase[i * 2] = rand();
    phase[i * 2 + 1] = brightness;
  }

  return {
    count,
    position: buffer(gl, gl.ARRAY_BUFFER, position),
    phase: buffer(gl, gl.ARRAY_BUFFER, phase),
  };
}

/** A palette the scene can safely mutate as it eases between themes. */
function clonePalette(palette) {
  return Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])
  );
}

/**
 * Ease every palette value toward the target, so switching theme mid-generation
 * is a dusk rather than a cut.
 */
function lerpPalette(current, target, t) {
  for (const key of Object.keys(target)) {
    const to = target[key];
    if (Array.isArray(to)) {
      const from = current[key];
      for (let i = 0; i < to.length; i += 1) from[i] += (to[i] - from[i]) * t;
    } else {
      current[key] += (to - current[key]) * t;
    }
  }
}
