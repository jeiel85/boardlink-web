/**
 * Generates the PWA icons and screenshots referenced by the web manifest.
 *
 * Pure Node (no image-processing dependency): rasters are drawn into an RGBA
 * buffer and encoded as PNG with the built-in zlib. Re-run with
 * `pnpm generate:pwa-assets` whenever the brand motif changes.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---- PNG encoding -----------------------------------------------------------

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Tiny raster canvas -----------------------------------------------------

type RGB = [number, number, number];

const INDIGO: RGB = [99, 102, 241];
const VIOLET: RGB = [168, 85, 247];
const BG_TOP: RGB = [27, 32, 48];
const BG_BOTTOM: RGB = [13, 15, 23];
const LIGHT: RGB = [226, 232, 240];

class Canvas {
  readonly data: Buffer;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = Buffer.alloc(width * height * 4);
  }

  private blend(x: number, y: number, [r, g, b]: RGB, a: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 4;
    const inv = 1 - a;
    this.data[i] = Math.round(this.data[i] * inv + r * a);
    this.data[i + 1] = Math.round(this.data[i + 1] * inv + g * a);
    this.data[i + 2] = Math.round(this.data[i + 2] * inv + b * a);
    this.data[i + 3] = 255;
  }

  verticalGradient(top: RGB, bottom: RGB): void {
    for (let y = 0; y < this.height; y++) {
      const t = this.height === 1 ? 0 : y / (this.height - 1);
      const color: RGB = [
        Math.round(top[0] + (bottom[0] - top[0]) * t),
        Math.round(top[1] + (bottom[1] - top[1]) * t),
        Math.round(top[2] + (bottom[2] - top[2]) * t),
      ];
      for (let x = 0; x < this.width; x++) this.blend(x, y, color, 1);
    }
  }

  rect(x: number, y: number, w: number, h: number, color: RGB, a = 1): void {
    for (let yy = Math.floor(y); yy < y + h; yy++)
      for (let xx = Math.floor(x); xx < x + w; xx++) this.blend(xx, yy, color, a);
  }

  // Anti-aliased filled disc.
  disc(cx: number, cy: number, r: number, color: RGB): void {
    const x0 = Math.floor(cx - r - 1);
    const x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1);
    const y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const a = d <= r - 0.5 ? 1 : d >= r + 0.5 ? 0 : r + 0.5 - d;
        if (a > 0) this.blend(x, y, color, a);
      }
    }
  }

  png(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }
}

/** Draws the BoardLink board motif (3x3 grid + two stones) centered in a box. */
function drawBoard(c: Canvas, bx: number, by: number, bs: number): void {
  // Panel
  c.rect(bx, by, bs, bs, [18, 22, 34]);
  const line = Math.max(2, Math.round(bs * 0.02));
  const inset = bs * 0.12;
  const gx0 = bx + inset;
  const gs = bs - inset * 2;
  // 3x3 grid lines
  for (let i = 0; i <= 3; i++) {
    const off = gx0 + (gs * i) / 3;
    c.rect(off - line / 2, by + inset, line, gs, [71, 85, 105]); // vertical
    c.rect(bx + inset, off - line / 2, gs, line, [71, 85, 105]); // horizontal
  }
  // Two stones on intersections
  const cell = gs / 3;
  c.disc(gx0 + cell * 1, by + inset + cell * 1, cell * 0.42, INDIGO);
  c.disc(gx0 + cell * 2, by + inset + cell * 2, cell * 0.42, VIOLET);
  c.disc(gx0 + cell * 2, by + inset + cell * 1, cell * 0.42, LIGHT);
}

function makeIcon(size: number, maskable: boolean): Buffer {
  const c = new Canvas(size, size);
  c.verticalGradient(BG_TOP, BG_BOTTOM);
  // Maskable icons need their content inside the ~80% safe zone.
  const boardFraction = maskable ? 0.56 : 0.7;
  const bs = size * boardFraction;
  const off = (size - bs) / 2;
  drawBoard(c, off, off, bs);
  return c.png();
}

function makeScreenshot(width: number, height: number): Buffer {
  const c = new Canvas(width, height);
  c.verticalGradient(BG_TOP, BG_BOTTOM);
  // Header + footer accent bars to read as an app frame.
  c.rect(0, 0, width, Math.round(height * 0.1), INDIGO, 0.18);
  c.rect(0, height - Math.round(height * 0.08), width, Math.round(height * 0.08), VIOLET, 0.14);
  const bs = Math.min(width, height) * 0.52;
  drawBoard(c, (width - bs) / 2, (height - bs) / 2, bs);
  return c.png();
}

// ---- Emit -------------------------------------------------------------------

const PUBLIC = join(process.cwd(), 'apps/platform/public');

const outputs: Array<{ path: string; data: Buffer }> = [
  { path: 'icons/icon-192.png', data: makeIcon(192, false) },
  { path: 'icons/icon-512.png', data: makeIcon(512, false) },
  { path: 'icons/icon-maskable.png', data: makeIcon(512, true) },
  { path: 'screenshots/desktop.png', data: makeScreenshot(1280, 720) },
  { path: 'screenshots/mobile.png', data: makeScreenshot(720, 1280) },
];

for (const { path, data } of outputs) {
  const full = join(PUBLIC, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  console.log(`wrote ${path} (${data.length} bytes)`);
}
console.log('PWA assets generated.');
