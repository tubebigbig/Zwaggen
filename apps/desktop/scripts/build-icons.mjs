import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', '..', 'docs', 'public', 'favicon.svg');
const OUT = resolve(__dirname, '..', 'build');
const ICONS = resolve(OUT, 'icons');
const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

await mkdir(ICONS, { recursive: true });

const buffers = await Promise.all(
  SIZES.map(async (size) => {
    const buf = await sharp(SRC).resize(size, size).png().toBuffer();
    await writeFile(resolve(ICONS, `${size}x${size}.png`), buf);
    return { size, buf };
  }),
);

const findBuf = (size) => buffers.find((b) => b.size === size).buf;

await writeFile(resolve(OUT, 'icon.png'), findBuf(1024));

const icoSizes = [16, 32, 48, 64, 128, 256];
const icoBuf = await pngToIco(icoSizes.map((s) => resolve(ICONS, `${s}x${s}.png`)));
await writeFile(resolve(OUT, 'icon.ico'), icoBuf);

if (process.platform === 'darwin') {
  const iconset = resolve(OUT, 'icon.iconset');
  await rm(iconset, { recursive: true, force: true });
  try {
    await mkdir(iconset, { recursive: true });
    // Apple expects: icon_<N>x<N>.png + icon_<N>x<N>@2x.png pairs
    const macSizes = [16, 32, 64, 128, 256, 512, 1024];
    for (const s of macSizes) {
      if (s !== 1024) await writeFile(resolve(iconset, `icon_${s}x${s}.png`), findBuf(s));
      if (s !== 16) await writeFile(resolve(iconset, `icon_${s / 2}x${s / 2}@2x.png`), findBuf(s));
    }
    await exec('iconutil', ['-c', 'icns', '-o', resolve(OUT, 'icon.icns'), iconset]);
  } finally {
    // Always clean up the temp iconset, even if iconutil fails — otherwise
    // a partial run leaves stale PNGs that confuse the next invocation.
    await rm(iconset, { recursive: true, force: true });
  }
}

console.log('Icons generated to', OUT);
