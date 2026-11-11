import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../testing/logger.ts';
import { fromUrl, makeCover, writeSquareJpeg } from './cover.ts';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pluck-cover-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const image = (width: number, height: number, background: { r: number; g: number; b: number }) =>
  sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();

describe('writeSquareJpeg', () => {
  it('crops a 16:9 thumbnail to a centred square and finds its colour', async () => {
    const output = join(dir, 'cover.jpg');
    const color = await writeSquareJpeg(await image(1280, 720, { r: 200, g: 30, b: 60 }), output);

    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 720, height: 720 });
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('shrinks large images to 1000px', async () => {
    const output = join(dir, 'cover.jpg');
    await writeSquareJpeg(await image(3000, 3000, { r: 0, g: 0, b: 0 }), output);
    expect(await sharp(output).metadata()).toMatchObject({ width: 1000, height: 1000 });
  });
});

describe('makeCover', () => {
  it('uses the first source that works', async () => {
    const good = await image(500, 500, { r: 0, g: 0, b: 255 });
    const cover = await makeCover(
      [
        { name: 'broken', load: async () => Buffer.from('not an image') },
        { name: 'failing', load: () => Promise.reject(new Error('404')) },
        { name: 'good', load: async () => good },
      ],
      join(dir, 'cover.jpg'),
      silentLogger,
    );
    expect(cover).toEqual({ path: join(dir, 'cover.jpg'), color: expect.stringMatching(/^#[0-9a-f]{6}$/) });
  });

  it('returns null when no source works', async () => {
    await expect(makeCover([{ name: 'broken', load: async () => Buffer.from('x') }], join(dir, 'cover.jpg'), silentLogger)).resolves.toBeNull();
  });
});

describe('fromUrl', () => {
  it('rejects responses that are not images', async () => {
    const source = fromUrl('https://example.test/a', async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    await expect(source.load()).rejects.toThrow('Not an image');
  });

  it('returns the image bytes', async () => {
    const source = fromUrl('https://example.test/a.jpg', async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }));
    await expect(source.load()).resolves.toEqual(Buffer.from([1, 2, 3]));
  });
});
