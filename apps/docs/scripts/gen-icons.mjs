import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, '../public/favicon.svg');
const outDir = resolve(here, '../public');

const sizes = [192, 512];

const svg = await readFile(svgPath);

await mkdir(outDir, { recursive: true });
for (const size of sizes) {
  const outPath = resolve(outDir, `pwa-${size}.png`);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}
