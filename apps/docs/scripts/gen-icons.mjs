import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, '../public/favicon.svg');
const outDir = resolve(here, '../public');

const svg = await readFile(svgPath);
await mkdir(outDir, { recursive: true });

// Square icons rasterized directly from the brand SVG.
const squareTargets = [
  { name: 'favicon-16.png',        size: 16 },
  { name: 'favicon-32.png',        size: 32 },
  { name: 'apple-touch-icon.png',  size: 180 },
  { name: 'pwa-192.png',           size: 192 },
  { name: 'pwa-512.png',           size: 512 },
  { name: 'pwa-1024.png',          size: 1024 },
];

for (const { name, size } of squareTargets) {
  const outPath = resolve(outDir, name);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}

// Maskable icon: the brand mark centered inside a 1024x1024 indigo square
// with ~20% safe-zone padding on each side (mark fills the center 60%).
// This lets OS-level masks (macOS squircle, Android circle) clip the padding
// without touching the logo.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#4f46e5"/>
  <g transform="translate(208, 208) scale(9.5)">
    <polyline points="18,22 46,22 18,42 46,42"
      fill="none" stroke="#ffffff" stroke-width="9"
      stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
const maskablePath = resolve(outDir, 'pwa-maskable-512.png');
await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile(maskablePath);
console.log(`wrote ${maskablePath}`);

// Multi-size .ico built from 16/32/48 PNGs.
const icoSizes = [16, 32, 48];
const icoBuffers = [];
for (const size of icoSizes) {
  icoBuffers.push(
    await sharp(svg, { density: 384 })
      .resize(size, size)
      .png()
      .toBuffer()
  );
}
const icoBuffer = await pngToIco(icoBuffers);
const icoPath = resolve(outDir, 'favicon.ico');
await writeFile(icoPath, icoBuffer);
console.log(`wrote ${icoPath}`);

// OG card — 1200x630 inline SVG rasterized to PNG.
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#4f46e5"/>
  <g transform="translate(120, 195) scale(3.75)">
    <rect width="64" height="64" rx="14" fill="#ffffff"/>
    <polyline points="18,22 46,22 18,42 46,42"
      fill="none" stroke="#4f46e5" stroke-width="9"
      stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="420" y="310" font-family="-apple-system, system-ui, Arial, sans-serif"
    font-weight="700" font-size="104" fill="#ffffff">Zwaggen</text>
  <text x="420" y="372" font-family="-apple-system, system-ui, Arial, sans-serif"
    font-size="36" fill="#e0e7ff">Typed API specs,</text>
  <text x="420" y="418" font-family="-apple-system, system-ui, Arial, sans-serif"
    font-size="36" fill="#e0e7ff">runtime-tested.</text>
</svg>`;
const ogPath = resolve(outDir, 'og-image.png');
await sharp(Buffer.from(ogSvg)).png().toFile(ogPath);
console.log(`wrote ${ogPath}`);
