import type { Context } from 'hono';
import type { AppEnv } from '../lib/types.ts';

export async function genres(c: Context<AppEnv>) {
  return c.json({ genres: await c.get('services').catalog.genres() });
}

export async function charts(c: Context<AppEnv>, query: { genreId: number; limit: number }) {
  return c.json({ tracks: await c.get('services').catalog.charts(query.genreId, query.limit) });
}

export async function trending(c: Context<AppEnv>, query: { country: string; limit: number }) {
  return c.json({ tracks: await c.get('services').catalog.trending(query.country, query.limit) });
}

export async function search(c: Context<AppEnv>, query: { q: string; limit: number }) {
  return c.json({ tracks: await c.get('services').catalog.search(query.q, query.limit) });
}

export async function forYou(c: Context<AppEnv>) {
  return c.json(await c.get('services').catalog.forYou());
}

export async function youtube(c: Context<AppEnv>, query: { q: string; limit: number }) {
  return c.json({ videos: await c.get('services').catalog.youtube(query.q, query.limit) });
}
