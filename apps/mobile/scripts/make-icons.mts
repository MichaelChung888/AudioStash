// Draws the app icons from the same shapes as Logo in src/ui/Icon.tsx. Run it after changing the logo:
//
//   pnpm --filter @pluck/mobile icons
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ACCENT = '#F5B83D';
const INK = '#0B0C0E';
const SIZE = 1024;

const square = `<rect width="28" height="28" rx="7" fill="${ACCENT}"/>`;

function glyph(color: string): string {
  return [
    `<path d="M6.5 9.5v11l8.5-5.5z" fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>`,
    `<circle cx="18.5" cy="13" r="2.2" fill="${color}"/>`,
    `<path d="M20.7 13V6.2c1.6.3 2.6 1.3 2.6 2.9" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}

function svg(viewBox: string, body: string): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="${viewBox}">${body}</svg>`);
}

// Android draws adaptive icon layers on a 108 dp canvas and shows only the middle 72 dp.
// Widening the 28-unit logo box to 42 units puts the logo's square on that visible part.
// The background colour comes from adaptiveIcon.backgroundColor in app.config.ts.
const ADAPTIVE = '-7 -7 42 42';

const icons: Record<string, Buffer> = {
  'icon.png': svg('0 0 28 28', square + glyph(INK)),
  'splash-icon.png': svg('0 0 28 28', square + glyph(INK)),
  'android-icon-foreground.png': svg(ADAPTIVE, glyph(INK)),
  // Android uses only the shape of this layer and colours it to match the wallpaper.
  'android-icon-monochrome.png': svg(ADAPTIVE, glyph('#FFFFFF')),
};

for (const [name, image] of Object.entries(icons)) {
  const path = fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
  await sharp(image).png().toFile(path);
  console.log(`Wrote assets/${name}`);
}
