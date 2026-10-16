// Draws the toolbar icons (rounded violet square, white lens with a check) straight
// to PNG, so the repo needs no image tools. Run with: pnpm icons
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

const BRAND = [0x5b, 0x4b, 0xff];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideRoundRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4;
  const radius = size * 0.22;
  const scale = (size * 0.7) / 24;
  const offset = size * 0.15;
  const stroke = size <= 16 ? 2.9 : size <= 32 ? 2.5 : 2.1;
  const withCheck = size >= 48;

  const ink = (gx, gy) => {
    if (Math.abs(Math.hypot(gx - 11, gy - 11) - 7) <= stroke / 2) return true;
    if (segDist(gx, gy, 16.4, 16.4, 21, 21) <= stroke / 2) return true;
    if (withCheck) {
      if (segDist(gx, gy, 8, 11.2, 10, 13.2) <= stroke / 2.4) return true;
      if (segDist(gx, gy, 10, 13.2, 13.6, 9.4) <= stroke / 2.4) return true;
    }
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insideRoundRect(px, py, size, radius)) continue;
          bg++;
          if (ink((px - offset) / scale, (py - offset) / scale)) fg++;
        }
      }
      const total = SS * SS;
      const i = (y * size + x) * 4;
      const f = bg ? fg / bg : 0;
      rgba[i] = Math.round(BRAND[0] * (1 - f) + 255 * f);
      rgba[i + 1] = Math.round(BRAND[1] * (1 - f) + 255 * f);
      rgba[i + 2] = Math.round(BRAND[2] * (1 - f) + 255 * f);
      rgba[i + 3] = Math.round((bg / total) * 255);
    }
  }
  return png(size, rgba);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(out, `icon-${size}.png`), draw(size));
}
console.log(`icons written to ${out}`);
