// Spotify, YouTube and Tidal all normalise to about -14 LUFS (loudness units
// relative to full scale), so songs from different sources play at a similar volume.
export const TARGET_LUFS = -14;

export function gainToTarget(measuredLufs: number, targetLufs = TARGET_LUFS): number {
  return Math.round((targetLufs - measuredLufs) * 100) / 100;
}

// Converts a gain in decibels to a player volume between 0 and 1. The phone's
// player can only turn a song down (volume <= 1), so quiet songs stay as they are.
export function gainToVolume(gainDb: number): number {
  const linear = 10 ** (gainDb / 20);
  return Math.min(1, Math.max(0, linear));
}
