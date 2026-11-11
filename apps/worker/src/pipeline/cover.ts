import sharp from 'sharp';
import type { Logger } from '../lib/logger.ts';

export interface CoverSource {
  // Shown in logs when this source fails.
  name: string;
  load(): Promise<Buffer>;
}

export interface Cover {
  path: string;
  // The image's most common colour as "#rrggbb". The app tints the player screen with it.
  color: string | null;
}

const MAX_SIDE = 1000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// Tries each source in order and keeps the first image that decodes.
export async function makeCover(sources: readonly CoverSource[], output: string, logger: Logger): Promise<Cover | null> {
  for (const source of sources) {
    try {
      const color = await writeSquareJpeg(await source.load(), output);
      return { path: output, color };
    } catch (error) {
      logger.debug({ err: error, source: source.name }, 'cover source failed, trying the next one');
    }
  }
  return null;
}

// Covers are square everywhere in the app, and video thumbnails are 16:9 with the
// artwork in the middle, so the image is cropped to a centred square.
// 1000px is the size Deezer serves and is sharp on any phone screen.
export async function writeSquareJpeg(input: Buffer, output: string): Promise<string> {
  const image = sharp(input, { failOn: 'error' }).rotate();
  const { width, height } = await image.metadata();
  if (!width || !height) throw new Error('Image has no size');

  const side = Math.min(MAX_SIDE, width, height);
  await image.resize(side, side, { fit: 'cover', position: 'centre' }).jpeg({ quality: 90, mozjpeg: true }).toFile(output);

  const { dominant } = await sharp(output).stats();
  return toHex(dominant);
}

export function fromUrl(url: string, fetchImpl: typeof fetch = fetch): CoverSource {
  return {
    name: new URL(url).hostname,
    async load() {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) throw new Error(`Not an image: ${type || 'no content type'}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > MAX_IMAGE_BYTES) throw new Error(`Image is too large: ${body.length} bytes`);
      return body;
    },
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}
