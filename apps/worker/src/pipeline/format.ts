import { AUDIO_EXTENSIONS, type AudioCodec, type AudioFormat } from '@pluck/contracts';

export interface EncodePlan {
  codec: AudioCodec;
  extension: string;
  // ffmpeg's audio codec arguments.
  args: string[];
  reencode: boolean;
}

const COPY = ['-c:a', 'copy'];
const ENCODERS: Record<AudioCodec, string[]> = {
  // 192 kb/s Opus is transparent for almost everyone: listeners cannot tell it from the source.
  opus: ['-c:a', 'libopus', '-b:a', '192k'],
  aac: ['-c:a', 'aac', '-b:a', '256k'],
  // -q:a 0 is LAME's highest-quality variable bitrate, about 245 kb/s.
  mp3: ['-c:a', 'libmp3lame', '-q:a', '0'],
};

// Copies the source stream whenever its codec is acceptable. Re-encoding lossy
// audio always loses a little quality, so it is only done when the chosen format
// needs it, or the source codec is one the phone app does not store (e.g. FLAC, Vorbis).
export function planEncode(sourceCodec: string, format: AudioFormat): EncodePlan {
  const source = asAudioCodec(sourceCodec);
  const target: AudioCodec = format === 'm4a' ? 'aac' : format === 'mp3' ? 'mp3' : (source ?? 'opus');
  const reencode = source !== target;
  return { codec: target, extension: AUDIO_EXTENSIONS[target], args: reencode ? ENCODERS[target] : COPY, reencode };
}

function asAudioCodec(ffprobeCodec: string): AudioCodec | null {
  if (ffprobeCodec === 'opus' || ffprobeCodec === 'aac' || ffprobeCodec === 'mp3') return ffprobeCodec;
  return null;
}
