#!/usr/bin/env node
/**
 * Builds the macOS app icon from the SFab mark.
 *
 * `build/mark.svg` is the mark as it ships in sfab-oss/sfab
 * (apps/platform/public/favicon.svg) — the simplified six-dot mark the brand
 * uses for every raster icon, not the detailed logo it uses in headers.
 *
 * A mark is not an app icon. macOS draws icons inside a rounded square on a
 * fixed grid, so the mark gets centred on its own bounding box (which is not
 * the centre of its viewBox) and inset well clear of the corners. Apple's
 * proportions: a 1024 canvas, an 824 body, a 185.4 corner radius.
 *
 * qlmanage flattens SVG onto white instead of keeping the alpha channel, which
 * would leave the icon a plain white square with its rounded corners painted
 * on. So the body is masked back in here: the same rounded rectangle, sampled
 * per pixel, written straight into the PNG's alpha.
 *
 * macOS only: qlmanage is the rasteriser and iconutil builds the .icns. The
 * output is committed, so nobody has to run this to build the app.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync, inflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, "..", "build");

const CANVAS = 1024;
const BODY = 824;
const RADIUS = 185.4;
/** Padding between the body's edge and the mark, so no dot rides the curve. */
const INSET = 132;

// ---------------------------------------------------------------- the artwork

const source = readFileSync(join(buildDir, "mark.svg"), "utf8");
const circles = [...source.matchAll(/<circle\b([^>]*)\/>/g)].map((m) => {
  const attr = (name) => {
    const found = m[1].match(new RegExp(`${name}="([^"]*)"`));
    if (!found) throw new Error(`mark.svg: a circle has no ${name}`);
    return found[1];
  };
  return { cx: Number(attr("cx")), cy: Number(attr("cy")), r: Number(attr("r")), fill: attr("fill") };
});
if (!circles.length) throw new Error("mark.svg: no circles — has the mark changed shape?");

const bounds = circles.reduce(
  (box, c) => ({
    minX: Math.min(box.minX, c.cx - c.r),
    minY: Math.min(box.minY, c.cy - c.r),
    maxX: Math.max(box.maxX, c.cx + c.r),
    maxY: Math.max(box.maxY, c.cy + c.r),
  }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
);
const scale = (BODY - INSET * 2) / Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };

const round = (n) => Number(n.toFixed(4));
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <title>sfab-bench</title>
  <rect x="${(CANVAS - BODY) / 2}" y="${(CANVAS - BODY) / 2}" width="${BODY}" height="${BODY}" rx="${RADIUS}" ry="${RADIUS}" fill="#ffffff"/>
  <g transform="translate(${CANVAS / 2} ${CANVAS / 2}) scale(${round(scale)}) translate(${round(-centre.x)} ${round(-centre.y)})">
${circles.map((c) => `    <circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${c.fill}"/>`).join("\n")}
  </g>
</svg>
`;

// ------------------------------------------------------------------- the mask

/** Signed-distance test for a rounded rectangle, collapsed to a boolean. */
function inside(x, y, x0, y0, side, r) {
  const x1 = x0 + side;
  const y1 = y0 + side;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const nx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const ny = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= r * r;
}

const SAMPLES = 4;

/** Rewrites a truecolour-with-alpha PNG so only the rounded body is opaque. */
function maskRounded(file, size) {
  const png = readFileSync(file);
  const chunks = [];
  let pos = 8;
  let header;
  let compressed = Buffer.alloc(0);
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString("latin1", pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9] };
    if (type === "IDAT") compressed = Buffer.concat([compressed, body]);
    else chunks.push({ type, body });
    pos += 12 + length;
  }
  if (!header) throw new Error(`${file}: no IHDR`);
  const { width, height, depth, colour } = header;
  if (depth !== 8 || colour !== 6) throw new Error(`${file}: expected 8-bit RGBA, got depth ${depth} colour type ${colour}`);

  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(compressed);
  const pixels = Buffer.alloc(height * stride);
  let read = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[read];
    read += 1;
    const row = raw.subarray(read, read + stride);
    read += stride;
    const at = y * stride;
    const above = at - stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? pixels[at + x - bpp] : 0;
      const b = y > 0 ? pixels[above + x] : 0;
      const c = y > 0 && x >= bpp ? pixels[above + x - bpp] : 0;
      let value = row[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`${file}: unknown row filter ${filter}`);
      pixels[at + x] = value & 0xff;
    }
  }

  const unit = size / CANVAS;
  const x0 = ((CANVAS - BODY) / 2) * unit;
  const side = BODY * unit;
  const r = RADIUS * unit;
  const step = 1 / SAMPLES;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          if (inside(x + (sx + 0.5) * step, y + (sy + 0.5) * step, x0, x0, side, r)) hits += 1;
        }
      }
      const alpha = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
      const at = y * stride + x * bpp;
      pixels[at + 3] = Math.min(pixels[at + 3], alpha);
    }
  }

  const filtered = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = 0;
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const rebuilt = chunks.map((chunk) => (chunk.type === "IEND" ? null : chunk)).filter(Boolean);
  rebuilt.push({ type: "IDAT", body: deflateSync(filtered, { level: 9 }) });
  rebuilt.push({ type: "IEND", body: Buffer.alloc(0) });

  const out = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const chunk of rebuilt) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(chunk.body.length, 0);
    head.write(chunk.type, 4, "latin1");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), chunk.body])) >>> 0, 0);
    out.push(head, chunk.body, tail);
  }
  writeFileSync(file, Buffer.concat(out));
}

// ---------------------------------------------------------------- the raster

const work = mkdtempSync(join(tmpdir(), "sfab-icon-"));
const iconset = join(work, "icon.iconset");
mkdirSync(iconset);
const svg = join(work, "icon.svg");
writeFileSync(svg, icon);

/** qlmanage names its output after the input and fits the longest edge. */
function render(size) {
  const out = join(work, `at-${size}`);
  mkdirSync(out);
  execFileSync("qlmanage", ["-t", "-s", String(size), "-o", out, svg], { stdio: "ignore" });
  const png = join(out, "icon.svg.png");
  // Thumbnails come back close to the asked-for size, not always equal to it.
  execFileSync("sips", ["-z", String(size), String(size), png], { stdio: "ignore" });
  maskRounded(png, size);
  return png;
}

const sizes = [16, 32, 64, 128, 256, 512, 1024];
const rendered = new Map(sizes.map((size) => [size, render(size)]));

for (const point of [16, 32, 128, 256, 512]) {
  cpSync(rendered.get(point), join(iconset, `icon_${point}x${point}.png`));
  cpSync(rendered.get(point * 2), join(iconset, `icon_${point}x${point}@2x.png`));
}

execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(buildDir, "icon.icns")], { stdio: "inherit" });
cpSync(rendered.get(1024), join(buildDir, "icon.png"));
writeFileSync(join(buildDir, "icon.svg"), icon);
rmSync(work, { recursive: true, force: true });

console.log(`[icon] wrote icon.icns, icon.png and icon.svg to ${buildDir}`);
