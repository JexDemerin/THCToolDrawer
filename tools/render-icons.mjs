// Rasterise icons/icon.svg to the four sizes Chrome asks for.
//
//   node tools/render-icons.mjs
//
// icon.svg is the source of truth — edit the mark there, re-run this, and the
// PNGs follow. Chrome's manifest cannot take an SVG, hence the raster step.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SIZES = [16, 32, 48, 128];

const svg = readFileSync(join(ICONS, 'icon.svg'), 'utf8');
const browser = await chromium.launch();

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  );
  // omitBackground keeps the corners outside the squircle transparent.
  await page.locator('svg').screenshot({
    path: join(ICONS, `icon${size}.png`),
    omitBackground: true
  });
  await page.close();
  console.log(`icons/icon${size}.png`);
}

await browser.close();
