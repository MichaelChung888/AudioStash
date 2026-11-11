import { cleanChannelName, containment, normalizeForMatch, parseVideoTitle, similarity, stripFeaturing } from './text.ts';

export interface MatchTarget {
  title: string;
  artist: string;
  durationSec?: number | undefined;
}

export interface MatchCandidate {
  id: string;
  title: string;
  channel: string;
  durationSec: number | null;
}

export interface ScoredCandidate extends MatchCandidate {
  score: number;
}

// Words that mark a different recording of the song. A candidate with one of
// these is penalised unless the target title asks for it (e.g. a remix).
const VERSION_MARKERS = [
  'live',
  'cover',
  'remix',
  'sped up',
  'slowed',
  'reverb',
  'nightcore',
  '8d',
  'karaoke',
  'instrumental',
  'acoustic',
  'bass boosted',
  'reaction',
  'tutorial',
  'lesson',
  'extended',
  'mashup',
  'loop',
  '1 hour',
];

export const MATCH_THRESHOLD = 0.6;

export function scoreCandidate(target: MatchTarget, candidate: MatchCandidate): number {
  const parsed = parseVideoTitle(candidate.title, candidate.channel);
  const titleScore = Math.max(similarity(target.title, parsed.title), containment(target.title, candidate.title) * 0.9);
  const artistScore = Math.max(
    parsed.artist ? similarity(target.artist, parsed.artist) : 0,
    containment(target.artist, `${candidate.channel} ${candidate.title}`) * 0.9,
  );
  const durationScore = scoreDuration(target.durationSec, candidate.durationSec);

  let score = titleScore * 0.45 + artistScore * 0.25 + durationScore * 0.3;

  // Uploads by the artist: their own channel, their "Artist - Topic" channel
  // (YouTube's auto-generated official audio) or VEVO. Without this, a re-upload
  // that happens to be a few seconds closer in length can beat the official one.
  const ownChannel = normalizeForMatch(cleanChannelName(candidate.channel)) === normalizeForMatch(stripFeaturing(target.artist));
  if (ownChannel || /vevo$/i.test(candidate.channel)) score += 0.1;
  else if (/official\s+audio/i.test(candidate.title)) score += 0.05;

  const wanted = normalizeForMatch(target.title);
  const offered = normalizeForMatch(`${candidate.title}`);
  for (const marker of VERSION_MARKERS) {
    if (includesWord(offered, marker) && !includesWord(wanted, marker)) {
      score -= 0.3;
      break;
    }
  }

  // No upper limit: two candidates that both reach 1 are still told apart.
  return Math.max(0, score);
}

export function pickBestMatch(target: MatchTarget, candidates: MatchCandidate[], threshold = MATCH_THRESHOLD): ScoredCandidate | null {
  let best: ScoredCandidate | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(target, candidate);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  return best && best.score >= threshold ? best : null;
}

function scoreDuration(expected: number | undefined, actual: number | null): number {
  // Unknown on either side: neither reward nor punish.
  if (expected === undefined || actual === null) return 0.5;
  const diff = Math.abs(expected - actual);
  if (diff <= 2) return 1;
  if (diff <= 5) return 0.8;
  if (diff <= 10) return 0.5;
  if (diff <= 20) return 0.2;
  return 0;
}

function includesWord(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}
