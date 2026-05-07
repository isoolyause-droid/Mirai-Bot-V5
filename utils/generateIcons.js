/**
 * GOMO App v1.0 — Icon Generator
 * Generates PNG app icons using Jimp (no canvas needed)
 * Sizes: 72, 96, 128, 144, 192, 512
 */

const path = require('path');
const fs   = require('fs-extra');

const WEB_DIR = path.join(__dirname, '..', 'web');
const SIZES   = [72, 96, 128, 144, 192, 512];

// GOMO green: #00e676  →  R=0, G=230, B=118
const GREEN  = { r: 0,   g: 230, b: 118, a: 255 };
const BLACK  = { r: 10,  g: 10,  b: 10,  a: 255 };
const WHITE  = { r: 255, g: 255, b: 255, a: 255 };
const DARK   = { r: 20,  g: 20,  b: 20,  a: 255 };

function toHex(c) {
  return (c.a << 24 | c.b << 16 | c.g << 8 | c.r) >>> 0;
}

async function generateIcon(Jimp, size) {
  const outPath = path.join(WEB_DIR, `icon-${size}.png`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 500) return; // already exists

  const img = new Jimp({ width: size, height: size, color: toHex(BLACK) });

  // ── Rounded square background (green) ──
  const pad    = Math.round(size * 0.06);
  const corner = Math.round(size * 0.22);
  const bgX1   = pad;
  const bgY1   = pad;
  const bgX2   = size - pad;
  const bgY2   = size - pad;

  // Fill a rounded-rect approximation using scan
  img.scan(0, 0, size, size, function (x, y, idx) {
    const inX = x >= bgX1 && x < bgX2;
    const inY = y >= bgY1 && y < bgY2;
    if (!inX || !inY) return;

    // Corner rounding — Euclidean distance from corner points
    const dx = Math.min(x - bgX1, bgX2 - 1 - x);
    const dy = Math.min(y - bgY1, bgY2 - 1 - y);
    if (dx < corner && dy < corner) {
      const dist = Math.sqrt((corner - dx) ** 2 + (corner - dy) ** 2);
      if (dist > corner) return;
    }

    this.bitmap.data[idx]     = GREEN.r;
    this.bitmap.data[idx + 1] = GREEN.g;
    this.bitmap.data[idx + 2] = GREEN.b;
    this.bitmap.data[idx + 3] = 255;
  });

  // ── Music note symbol (♪) drawn as filled shapes ──
  const cx   = Math.round(size / 2);
  const cy   = Math.round(size / 2);
  const unit = Math.round(size * 0.07); // base unit

  // Note stem (vertical rectangle)
  const stemX  = cx + unit;
  const stemY1 = cy - unit * 2.5;
  const stemY2 = cy + unit * 1.5;
  const stemW  = Math.max(2, Math.round(unit * 0.55));

  // Note head (filled ellipse)
  const headCX = cx - unit * 0.2;
  const headCY = cy + unit * 1.5;
  const headRX = Math.round(unit * 1.1);
  const headRY = Math.round(unit * 0.75);

  // Beam (horizontal bar at top of stem)
  const beamX1  = cx - unit * 1.5;
  const beamX2  = cx + unit + stemW;
  const beamY1  = cy - unit * 2.5;
  const beamH   = Math.max(2, Math.round(unit * 0.55));

  // Second note head (small, left)
  const head2CX = cx - unit * 1.5;
  const head2CY = cy + unit * 1.0;
  const head2RX = Math.round(unit * 0.9);
  const head2RY = Math.round(unit * 0.6);

  img.scan(0, 0, size, size, function (x, y, idx) {
    let fill = false;

    // Stem
    if (x >= stemX && x < stemX + stemW && y >= stemY1 && y <= stemY2) fill = true;

    // Left stem
    const stemLX = cx - unit * 1.5;
    if (x >= stemLX && x < stemLX + stemW && y >= beamY1 && y <= cy + unit * 1.0) fill = true;

    // Beam (top horizontal)
    if (x >= beamX1 && x <= beamX2 && y >= beamY1 && y < beamY1 + beamH) fill = true;

    // Note head 1
    const eDX1 = (x - headCX) / headRX;
    const eDY1 = (y - headCY) / headRY;
    if (eDX1 * eDX1 + eDY1 * eDY1 <= 1.0) fill = true;

    // Note head 2
    const eDX2 = (x - head2CX) / head2RX;
    const eDY2 = (y - head2CY) / head2RY;
    if (eDX2 * eDX2 + eDY2 * eDY2 <= 1.0) fill = true;

    if (fill) {
      this.bitmap.data[idx]     = BLACK.r;
      this.bitmap.data[idx + 1] = BLACK.g;
      this.bitmap.data[idx + 2] = BLACK.b;
      this.bitmap.data[idx + 3] = 255;
    }
  });

  await img.write(outPath);
}

async function generateAllIcons() {
  try {
    const Jimp = (await import('jimp')).Jimp;
    for (const size of SIZES) {
      await generateIcon(Jimp, size);
    }
    console.log(`[GOMO Icons] ✅ App icons generated: ${SIZES.map(s => s + 'px').join(', ')}`);
  } catch (e) {
    console.warn('[GOMO Icons] ⚠️ Icon generation skipped:', e.message?.slice(0, 60));
  }
}

module.exports = { generateAllIcons };
