/**
 * Generates the PWA icons with no external dependency (no ImageMagick, no PIL,
 * no network) — raw RGBA pixels deflated with Node's built-in zlib.
 *
 *   node tools/make-icons.mjs
 *
 * Writes assets/icons/icon-192.png, icon-512.png and icon-maskable-512.png.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
const BRAND = [31, 111, 235];       // #1f6feb — matches --brand in styles.css
const INK = [255, 255, 255];

/* ------------------------------------------------------------- png encoder */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;      // bit depth
  ihdr[9] = 6;      // colour type: RGBA
  ihdr[10] = 0;     // compression
  ihdr[11] = 0;     // filter
  ihdr[12] = 0;     // interlace

  // Each scanline is prefixed with filter type 0 (None).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- the artwork */

/** Squared distance from a point to a line segment, in normalised units. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Rounded-rectangle coverage, 0..1 (used for the tile background). */
function roundedRect(x, y, radius) {
  const cx = Math.max(radius, Math.min(1 - radius, x));
  const cy = Math.max(radius, Math.min(1 - radius, y));
  const d = Math.hypot(x - cx, y - cy);
  return d <= radius ? 1 : Math.max(0, 1 - (d - radius) * 40);
}

/** The "K" mark, in normalised coordinates. */
function glyph(x, y) {
  const STEM = 0.062;
  const ARM = 0.058;
  const stem = Math.abs(x - 0.345) < STEM && y > 0.26 && y < 0.74 ? 1 : 0;
  const up = segDist(x, y, 0.41, 0.5, 0.7, 0.26) < ARM ? 1 : 0;
  const down = segDist(x, y, 0.41, 0.5, 0.7, 0.74) < ARM ? 1 : 0;
  return stem || up || down ? 1 : 0;
}

function render(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  // Maskable icons need the artwork inside the central 80% safe zone.
  const scale = maskable ? 0.62 : 1;
  const radius = maskable ? 0.5 : 0.22;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const x = (px + 0.5) / size;
      const y = (py + 0.5) / size;
      const i = (py * size + px) * 4;

      const bg = maskable ? 1 : roundedRect(x, y, radius);
      if (bg <= 0) {
        rgba[i + 3] = 0;
        continue;
      }

      // Map the glyph into the scaled box, centred.
      const gx = (x - (1 - scale) / 2) / scale;
      const gy = (y - (1 - scale) / 2) / scale;
      const on = gx >= 0 && gx <= 1 && gy >= 0 && gy <= 1 ? glyph(gx, gy) : 0;

      const c = on ? INK : BRAND;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = Math.round(bg * 255);
    }
  }
  return encodePNG(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
];
for (const [name, size, opts] of targets) {
  const file = join(OUT_DIR, name);
  writeFileSync(file, render(size, opts));
  console.log(`wrote ${name} (${size}x${size})`);
}
