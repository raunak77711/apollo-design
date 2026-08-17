/**
 * Bake Moon_3D_Model into runtime assets for the generation scene.
 *
 * The supplied model is a 200×99 UV sphere carrying real (if subtle) crater
 * displacement — ±0.6% of the radius — plus a 2500×1250 albedo map and a
 * 1024×512 *height* map (greyscale, despite the .mtl calling it a normal map).
 *
 * Shipping 3 MB of ASCII OBJ to draw a sphere would be indefensible on a
 * loading screen, so this script does the expensive work once, offline:
 *
 *   moon.obj                  → moon-mesh.bin    (quantised, decimated)
 *   MoonMap2_2500x1250.jpg    → moon-color.webp  (1024×512, greyscale)
 *   moon-normal.jpg (height)  → moon-height.webp (512×256, greyscale)
 *
 * The height field stays a height field: baking it into an RGB normal map cost
 * 291 KB, while the same relief as one greyscale channel costs 15 KB and four
 * texture taps in the fragment shader. The shader does the Sobel.
 *
 * The displacement, the topology and the UVs are the model's own — nothing is
 * invented. Re-run with `npm run bake:moon` if the source model changes.
 *
 * Usage: node scripts/bake-moon.mjs
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// sharp lives in the server's dependency tree; this is a build-time script, so
// borrowing it there beats adding an image toolchain to the client.
const require = createRequire(resolve(fileURLToPath(import.meta.url), '../../server/package.json'));
const sharp = require('sharp');

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const SRC = resolve(ROOT, 'Moon_3D_Model');
const OUT = resolve(ROOT, 'client/src/assets/moon');

/* The source sphere's topology, verified against the file: one north pole,
   99 rings of 200 columns in ring-major order, one south pole. */
const COLS = 200;
const RINGS = 99;

/* Decimation. 50 columns × 50 rings keeps the model's large-scale crater
   relief — the part that actually breaks up the terminator — and a silhouette
   whose chord error is a fraction of a pixel at any size the moon is drawn,
   for an eighth of the vertices. */
const COL_STEP = 4;
const RING_STEP = 2;

const COLOR_TEX = { width: 1024, height: 512 };
const HEIGHT_TEX = { width: 512, height: 256 };

/* ------------------------------ mesh: parse ------------------------------ */

function readPositions(objPath) {
  const text = readFileSync(objPath, 'utf8');
  const positions = [];
  for (const line of text.split('\n')) {
    if (line[0] !== 'v' || line[1] !== ' ') continue;
    const [, x, y, z] = line.trim().split(/\s+/);
    positions.push([Number(x), Number(y), Number(z)]);
  }
  return positions;
}

/** Grid vertex → index into the OBJ's `v` list. */
const gridIndex = (ring, col) => 1 + ring * COLS + (col % COLS);

/* ----------------------------- mesh: rebuild ----------------------------- */

/**
 * Rebuild the sphere at the decimated resolution from the model's own vertex
 * positions. Topology, UVs and smooth normals are regenerated rather than
 * remapped: the source's per-face vt/vn fans exist only to paper over the
 * texture seam and the pole singularity, and a freshly generated grid handles
 * both correctly by construction.
 */
function buildMesh(positions) {
  const rings = [];
  for (let r = 0; r < RINGS; r += RING_STEP) rings.push(r);
  const cols = [];
  for (let c = 0; c < COLS; c += COL_STEP) cols.push(c);
  // A duplicated seam column carrying u = 1 avoids the texture wrapping back
  // across the last quad.
  const seamCols = [...cols, COLS];

  const radius = positions.reduce((max, p) => Math.max(max, Math.hypot(p[0], p[1], p[2])), 0);

  const pos = [];
  const uv = [];
  const push = (p, u, v) => {
    pos.push(p[0] / radius, p[1] / radius, p[2] / radius);
    uv.push(u, v);
  };

  // North pole first, then each ring, then the south pole — so index maths
  // below stays readable.
  const northStart = 0;
  push(positions[0], 0.5, 0);

  const ringStart = 1;
  const rowLength = seamCols.length;
  for (const r of rings) {
    // The source ring r sits at polar angle π(r+1)/100, which is exactly the
    // v it must sample from an equirectangular map.
    const v = (r + 1) / (RINGS + 1);
    for (const c of seamCols) {
      push(positions[gridIndex(r, c)], c / COLS, v);
    }
  }

  const southIndex = ringStart + rings.length * rowLength;
  push(positions[positions.length - 1], 0.5, 1);

  /* ------------------------------ indices ------------------------------ */

  /* Wound counter-clockwise seen from outside, matching the source model —
     column order runs anticlockwise about the north pole, which is why the
     caps look reversed. `assertOutward` proves it rather than trusting it. */
  const indices = [];
  const at = (rowIdx, colIdx) => ringStart + rowIdx * rowLength + colIdx;

  // North cap.
  for (let c = 0; c < rowLength - 1; c += 1) indices.push(northStart, at(0, c), at(0, c + 1));
  // Bands.
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let c = 0; c < rowLength - 1; c += 1) {
      const a = at(r, c);
      const b = at(r, c + 1);
      const d = at(r + 1, c);
      const e = at(r + 1, c + 1);
      indices.push(a, d, e, a, e, b);
    }
  }
  // South cap.
  const last = rings.length - 1;
  for (let c = 0; c < rowLength - 1; c += 1) indices.push(southIndex, at(last, c + 1), at(last, c));

  assertOutward(pos, indices);
  return { pos, uv, indices, normals: smoothNormals(pos, indices) };
}

/**
 * Every face must wind counter-clockwise seen from outside, or back-face
 * culling shows the inside of the moon and the smooth normals come out
 * inverted. On a sphere the test is exact: the face normal has to agree with
 * the centroid's direction from the centre.
 */
function assertOutward(pos, indices) {
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const centroid = [
      (pos[a] + pos[b] + pos[c]) / 3,
      (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3,
      (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3,
    ];
    if (n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2] <= 0) {
      throw new Error(`triangle ${i / 3} faces inward — check the index winding`);
    }
  }
}

/** Area-weighted smooth normals, recomputed for the decimated positions. */
function smoothNormals(pos, indices) {
  const normals = new Float64Array(pos.length);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    // Un-normalised cross product weights each face by twice its area.
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    for (const base of [a, b, c]) {
      normals[base] += n[0];
      normals[base + 1] += n[1];
      normals[base + 2] += n[2];
    }
  }

  const out = new Float32Array(pos.length);
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    out[i] = normals[i] / len;
    out[i + 1] = normals[i + 1] / len;
    out[i + 2] = normals[i + 2] / len;
  }
  return out;
}

/* ------------------------------ mesh: encode ----------------------------- */

/**
 * Layout — little-endian, every section aligned to its element size:
 *
 *   0   char[8]  "APMOON1\0"
 *   8   uint32   vertexCount
 *   12  uint32   indexCount
 *   16  int16[3n] positions  (unit sphere, /32767)
 *       int16[2n] uvs        (0..1, /32767)
 *       int8[4n]  normals    (/127, 4th byte padding for alignment)
 *       uint16[m] indices
 */
function encodeMesh({ pos, uv, indices, normals }) {
  const vertexCount = pos.length / 3;
  const header = 16;
  const posBytes = vertexCount * 3 * 2;
  const uvBytes = vertexCount * 2 * 2;
  const normalBytes = vertexCount * 4;
  const indexBytes = indices.length * 2;

  const buffer = new ArrayBuffer(header + posBytes + uvBytes + normalBytes + indexBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes.set([...'APMOON1'].map((ch) => ch.charCodeAt(0)).concat(0), 0);
  view.setUint32(8, vertexCount, true);
  view.setUint32(12, indices.length, true);

  const clamp = (v, limit) => Math.max(-limit, Math.min(limit, Math.round(v)));

  let offset = header;
  const posView = new Int16Array(buffer, offset, vertexCount * 3);
  for (let i = 0; i < pos.length; i += 1) posView[i] = clamp(pos[i] * 32767, 32767);
  offset += posBytes;

  const uvView = new Int16Array(buffer, offset, vertexCount * 2);
  for (let i = 0; i < uv.length; i += 1) uvView[i] = clamp(uv[i] * 32767, 32767);
  offset += uvBytes;

  const normalView = new Int8Array(buffer, offset, vertexCount * 4);
  for (let i = 0; i < vertexCount; i += 1) {
    normalView[i * 4] = clamp(normals[i * 3] * 127, 127);
    normalView[i * 4 + 1] = clamp(normals[i * 3 + 1] * 127, 127);
    normalView[i * 4 + 2] = clamp(normals[i * 3 + 2] * 127, 127);
    normalView[i * 4 + 3] = 0;
  }
  offset += normalBytes;

  const indexView = new Uint16Array(buffer, offset, indices.length);
  for (let i = 0; i < indices.length; i += 1) indexView[i] = indices[i];

  return Buffer.from(buffer);
}

/* -------------------------------- textures ------------------------------- */

/** Albedo: the source map is greyscale, so it ships as one channel. */
async function bakeColor() {
  return sharp(resolve(SRC, 'MoonMap2_2500x1250.jpg'))
    .resize(COLOR_TEX.width, COLOR_TEX.height, { fit: 'fill', kernel: 'lanczos3' })
    .greyscale()
    .webp({ quality: 72, effort: 6 })
    .toFile(resolve(OUT, 'moon-color.webp'));
}

/**
 * Relief. The .mtl calls this a normal map but the file is a single-channel
 * height field, and that is how it ships — the shader differentiates it. Half
 * the albedo's resolution is plenty: the craters here are low-frequency.
 */
async function bakeHeight() {
  return sharp(resolve(SRC, 'moon-normal.jpg'))
    .resize(HEIGHT_TEX.width, HEIGHT_TEX.height, { fit: 'fill', kernel: 'lanczos3' })
    .greyscale()
    .webp({ quality: 80, effort: 6 })
    .toFile(resolve(OUT, 'moon-height.webp'));
}

/* --------------------------------- main ---------------------------------- */

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  mkdirSync(OUT, { recursive: true });

  const positions = readPositions(resolve(SRC, 'moon.obj'));
  if (positions.length !== COLS * RINGS + 2) {
    throw new Error(
      `moon.obj has ${positions.length} vertices; expected ${COLS * RINGS + 2}. ` +
        'The source model changed shape — update COLS/RINGS before re-baking.'
    );
  }

  const mesh = buildMesh(positions);
  const encoded = encodeMesh(mesh);
  writeFileSync(resolve(OUT, 'moon-mesh.bin'), encoded);

  const [color, height] = await Promise.all([bakeColor(), bakeHeight()]);
  const total = encoded.length + color.size + height.size;

  console.log(`mesh    ${mesh.pos.length / 3} verts · ${mesh.indices.length / 3} tris · ${kb(encoded.length)}`);
  console.log(`color   ${color.width}×${color.height} · ${kb(color.size)}`);
  console.log(`height  ${height.width}×${height.height} · ${kb(height.size)}`);
  console.log(`total   ${kb(total)}`);
  console.log(`→ ${dirname(resolve(OUT, 'moon-mesh.bin'))}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
