// Generates placeholder icon assets for the plugin.
// SVGs are written verbatim; PNGs are produced via Node's zlib in a minimal
// hand-rolled encoder. Run with: node scripts/gen-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "com.wegastudios.claude-code-usage.sdPlugin", "imgs");

async function ensure(file) {
  await mkdir(dirname(file), { recursive: true });
}

// ---------- SVG icons ----------
const svgAction = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5"/>
  <path d="M7 7 L7 13 L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="13" cy="7" r="1.2" fill="currentColor"/>
</svg>
`;

const svgCategory = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
  <circle cx="14" cy="14" r="10" stroke="currentColor" stroke-width="2"/>
  <path d="M9 14 L13 18 L19 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const svgEncoder = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" fill="none">
  <circle cx="25" cy="25" r="20" stroke="white" stroke-width="2"/>
  <text x="25" y="32" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="white">C</text>
</svg>
`;

const svgKey = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" fill="none">
  <rect width="144" height="144" fill="#0B0B10"/>
  <circle cx="72" cy="62" r="34" stroke="#D97757" stroke-width="6"/>
  <text x="72" y="74" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="700" fill="#D97757">%</text>
  <text x="72" y="120" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="500" fill="#EAEAEA">Claude</text>
</svg>
`;

// ---------- PNG generator ----------
// Marketplace icon must be PNG. We render a 288x288 solid-color tile with a
// 2-color pixel pattern forming a "C". Tiny but valid PNG.
function buildChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function buildPng(width, height, rgbaPixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;       // bit depth
  ihdr[9] = 6;       // color type RGBA
  ihdr[10] = 0;      // compression
  ihdr[11] = 0;      // filter
  ihdr[12] = 0;      // interlace

  // Add filter byte (0 = none) at the start of every scanline
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgbaPixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    buildChunk("IHDR", ihdr),
    buildChunk("IDAT", idat),
    buildChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Renders a square "C" mark on a dark navy background. Edges are 1px
 * anti-aliased via supersampling so the vector-y curves don't look jagged
 * on retina screens.
 */
function makePluginIcon(size) {
  const W = size, H = size;
  const px = Buffer.alloc(W * H * 4);
  const bg = [0x0b, 0x0b, 0x10, 0xff];
  const fg = [0xd9, 0x77, 0x57, 0xff];
  // Solid background
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    px[o] = bg[0]; px[o + 1] = bg[1]; px[o + 2] = bg[2]; px[o + 3] = bg[3];
  }
  const cx = W / 2, cy = H / 2;
  const rOuter = W * 0.38;
  const rInner = W * 0.27;
  const wedgeRad = (38 * Math.PI) / 180;
  // 4× supersample for smooth edges
  const SS = 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS - 0.5;
          const fy = y + (sy + 0.5) / SS - 0.5;
          const dx = fx - cx, dy = fy - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= rOuter * rOuter && d2 >= rInner * rInner) {
            const ang = Math.atan2(dy, dx);
            if (Math.abs(ang) > wedgeRad) hits++;
          }
        }
      }
      if (hits === 0) continue;
      const a = hits / (SS * SS);
      const o = (y * W + x) * 4;
      px[o]     = Math.round(bg[0] * (1 - a) + fg[0] * a);
      px[o + 1] = Math.round(bg[1] * (1 - a) + fg[1] * a);
      px[o + 2] = Math.round(bg[2] * (1 - a) + fg[2] * a);
      px[o + 3] = 0xff;
    }
  }
  return buildPng(W, H, px);
}

function makeKeyIcon(size) {
  const W = size, H = size;
  const px = Buffer.alloc(W * H * 4);
  const bg = [0x0b, 0x0b, 0x10, 0xff];
  const fg = [0xd9, 0x77, 0x57, 0xff];
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    px[o] = bg[0]; px[o + 1] = bg[1]; px[o + 2] = bg[2]; px[o + 3] = bg[3];
  }
  const cx = W / 2, cy = H * 0.42;
  const rOuter = W * 0.32;
  const rInner = W * 0.22;
  const wedgeRad = (38 * Math.PI) / 180;
  const SS = 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS - 0.5;
          const fy = y + (sy + 0.5) / SS - 0.5;
          const dx = fx - cx, dy = fy - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= rOuter * rOuter && d2 >= rInner * rInner) {
            const ang = Math.atan2(dy, dx);
            if (Math.abs(ang) > wedgeRad) hits++;
          }
        }
      }
      if (hits === 0) continue;
      const a = hits / (SS * SS);
      const o = (y * W + x) * 4;
      px[o]     = Math.round(bg[0] * (1 - a) + fg[0] * a);
      px[o + 1] = Math.round(bg[1] * (1 - a) + fg[1] * a);
      px[o + 2] = Math.round(bg[2] * (1 - a) + fg[2] * a);
      px[o + 3] = 0xff;
    }
  }
  return buildPng(W, H, px);
}

// ---------- Write everything ----------
const svgFiles = [
  ["actions/tracker/icon.svg", svgAction],
  ["actions/tracker/encoder.svg", svgEncoder],
  ["plugin/category-icon.svg", svgCategory],
];
for (const [rel, body] of svgFiles) {
  const out = resolve(root, rel);
  await ensure(out);
  await writeFile(out, body, "utf-8");
  console.log("wrote", rel);
}

// Marketplace icon — Elgato wants 256×256 base + 512×512 @2x
const pngs = [
  ["plugin/marketplace.png", makePluginIcon(256)],
  ["plugin/marketplace@2x.png", makePluginIcon(512)],
  ["actions/tracker/key.png", makeKeyIcon(72)],
  ["actions/tracker/key@2x.png", makeKeyIcon(144)],
];
for (const [rel, buf] of pngs) {
  const out = resolve(root, rel);
  await ensure(out);
  await writeFile(out, buf);
  console.log("wrote", rel, "(" + buf.length + " bytes)");
}

// The old SVG key.svg from a previous run is replaced by key.png — remove
// the stale file so Stream Deck doesn't pick the wrong one.
import { unlink } from "node:fs/promises";
try { await unlink(resolve(root, "actions/tracker/key.svg")); console.log("removed stale actions/tracker/key.svg"); } catch {}
// Same: drop the old 288×288 marketplace.png if present (we wrote 256 now).
// Already overwritten above, no action needed — but log if found.
console.log("\nIcons regenerated. Run: streamdeck validate <sdPlugin folder>");
