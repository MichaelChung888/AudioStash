import { findActiveLine, formatDuration, type LyricLine, parseLrc } from '@audiostash/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LibrarySong } from '../db/library.ts';
import { usePlaybackStatus, usePlayer } from '../player/hooks.ts';
import { cycleRepeat, next, previous, seekTo, setShuffle, togglePlay } from '../player/player.ts';
import { Cover, IconButton, Touchable } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { MenuButton } from '../ui/menu.tsx';
import { colors, fonts } from '../ui/theme.ts';
import { playerBackground } from '../ui/tint.ts';

const CODEC_NAMES = { opus: 'Opus', aac: 'AAC', mp3: 'MP3' } as const;

export default function NowPlayingScreen() {
  const { current, source, shuffle, repeat } = usePlayer();

  useEffect(() => {
    if (!current) router.back();
  }, [current]);

  if (!current) return null;
  return <Player song={current} sourceName={source?.name ?? null} sourceId={source?.id ?? null} shuffle={shuffle} repeat={repeat} />;
}

interface PlayerProps {
  song: LibrarySong;
  sourceName: string | null;
  sourceId: string | null;
  shuffle: boolean;
  repeat: 'none' | 'all' | 'single';
}

function Player({ song, sourceName, sourceId, shuffle, repeat }: PlayerProps) {
  const status = usePlaybackStatus();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const coverSize = Math.min(window.width - 48, 420);
  const addToPlaylist = () => router.push(`/choose-playlist?songIds=${song.id}`);

  const chips = [
    song.audio.bitrateKbps ? `${CODEC_NAMES[song.audio.codec]} · ${song.audio.bitrateKbps} kbps` : CODEC_NAMES[song.audio.codec],
    song.loudness ? 'Volume levelled' : null,
    'On this phone',
  ].filter((chip): chip is string => chip !== null);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: playerBackground(song.coverColor, colors.player) }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}
    >
      <View style={styles.topBar}>
        <IconButton icon="down" label="Close the player" color={colors.text} onPress={() => router.back()} />
        <View style={styles.from}>
          <Text style={styles.fromLabel}>Playing from</Text>
          <Text numberOfLines={1} style={styles.fromName}>
            {sourceName ?? 'Your library'}
          </Text>
        </View>
        <MenuButton
          label="More"
          icon="moreHorizontal"
          color={colors.text}
          items={[
            { label: 'Add to a playlist', icon: 'plusCircle', onPress: addToPlaylist },
            ...(sourceId
              ? [
                  {
                    label: 'Open the playlist',
                    icon: 'playlists' as const,
                    onPress: () => router.dismissTo(`/playlist/${sourceId}`),
                  },
                ]
              : []),
          ]}
        />
      </View>

      <View style={[styles.coverShadow, { width: coverSize, height: coverSize }]}>
        <Cover uri={song.coverUri} color={song.coverColor} size={coverSize} radius={12} />
      </View>

      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text numberOfLines={2} style={styles.title}>
            {song.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {song.artist}
          </Text>
        </View>
        <IconButton icon="plusCircle" label="Add to a playlist" color={colors.playerSoft} size={26} onPress={addToPlaylist} />
      </View>

      <SeekBar position={status.currentTime} duration={status.duration > 0 ? status.duration : song.durationMs / 1000} />

      <View style={styles.controls}>
        <ControlButton icon="shuffle" label={shuffle ? 'Shuffle on' : 'Shuffle off'} active={shuffle} onPress={() => setShuffle(!shuffle)} />
        <IconButton icon="previous" label="Previous" color={colors.text} size={30} onPress={previous} />
        <Touchable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause' : 'Play'} onPress={togglePlay} round={68} style={styles.play}>
          <Icon name={status.playing ? 'pause' : 'play'} size={32} color={colors.onAccent} />
        </Touchable>
        <IconButton icon="next" label="Next" color={colors.text} size={30} onPress={next} />
        <View>
          <ControlButton icon="repeat" label={REPEAT_LABELS[repeat]} active={repeat !== 'none'} onPress={cycleRepeat} />
          {repeat === 'single' ? <Text style={styles.repeatOne}>1</Text> : null}
        </View>
      </View>

      <View style={styles.chips}>
        {chips.map((chip) => (
          <View key={chip} style={styles.chip}>
            <Text style={styles.chipText}>{chip}</Text>
          </View>
        ))}
      </View>

      <Lyrics song={song} positionMs={status.currentTime * 1000} />
    </ScrollView>
  );
}

const REPEAT_LABELS = { none: 'Repeat off', all: 'Repeat all', single: 'Repeat this song' } as const;

function ControlButton({ icon, label, active, onPress }: { icon: 'shuffle' | 'repeat'; label: string; active: boolean; onPress: () => void }) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      round={44}
      style={styles.control}
    >
      <Icon name={icon} size={22} color={active ? colors.accent : colors.playerMuted} />
    </Touchable>
  );
}

// Dragging moves the knob only; the song jumps when the finger lifts.
function SeekBar({ position, duration }: { position: number; duration: number }) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? (duration > 0 ? Math.min(1, position / duration) : 0);

  const fractionAt = (x: number) => (width > 0 ? Math.min(1, Math.max(0, x / width)) : 0);

  return (
    <View style={styles.seek}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Song position"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(position), text: formatDuration(position * 1000) }}
        onAccessibilityAction={(e) => seekTo(Math.max(0, Math.min(duration, position + (e.nativeEvent.actionName === 'increment' ? 10 : -10))))}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDragging(fractionAt(e.nativeEvent.locationX))}
        onResponderMove={(e) => setDragging(fractionAt(e.nativeEvent.locationX))}
        onResponderRelease={() => {
          if (dragging !== null) seekTo(dragging * duration);
          setDragging(null);
        }}
        onResponderTerminate={() => setDragging(null)}
        style={styles.seekHit}
      >
        <View pointerEvents="none" style={styles.seekTrack}>
          <View style={[styles.seekFill, { width: `${shown * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.knob, { left: shown * width - 6 }]} />
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{formatDuration(shown * duration * 1000)}</Text>
        <Text style={styles.time}>{formatDuration(duration * 1000)}</Text>
      </View>
    </View>
  );
}

function Lyrics({ song, positionMs }: { song: LibrarySong; positionMs: number }) {
  const synced = song.lyrics?.synced ?? null;
  const lines = useMemo<LyricLine[]>(() => (synced ? parseLrc(synced) : []), [synced]);
  const plain = song.lyrics?.plain ?? null;
  if (lines.length === 0 && !plain) return null;

  return (
    <View style={styles.lyrics}>
      <View style={styles.lyricsHeader}>
        <Text style={styles.lyricsTitle}>Lyrics</Text>
        {lines.length > 0 ? <Text style={styles.lyricsKind}>Synced</Text> : null}
      </View>
      {lines.length > 0 ? <SyncedLines lines={lines} positionMs={positionMs} /> : <Text style={styles.plain}>{plain}</Text>}
    </View>
  );
}

// The line being sung, one before it, and two after.
function SyncedLines({ lines, positionMs }: { lines: LyricLine[]; positionMs: number }) {
  const active = findActiveLine(lines, positionMs);
  const from = Math.max(0, active - 1);
  return (
    <View style={styles.lines}>
      {lines.slice(from, Math.max(active, 0) + 3).map((line, i) => {
        const index = from + i;
        const style = index === active ? styles.lineActive : index === active + 1 ? styles.lineNext : styles.line;
        return (
          <Text key={`${line.timeMs}-${index}`} style={style}>
            {line.text || '♪'}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 20, paddingHorizontal: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -12 },
  from: { flex: 1, alignItems: 'center' },
  fromLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.playerMuted },
  fromName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  coverShadow: {
    alignSelf: 'center',
    borderRadius: 12,
    backgroundColor: colors.player,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: fonts.heading, fontSize: 24, letterSpacing: -0.48, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 15, color: colors.playerMuted },
  seek: { gap: 6 },
  seekHit: { height: 24, justifyContent: 'center' },
  seekTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  seekFill: { height: 4, backgroundColor: colors.accent },
  knob: { position: 'absolute', top: 6, width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontFamily: fonts.regular, fontSize: 12, color: colors.playerMuted, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  control: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  repeatOne: { position: 'absolute', right: 6, top: 4, fontFamily: fonts.bold, fontSize: 9, color: colors.accent },
  play: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { height: 28, paddingHorizontal: 12, borderRadius: 14, justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  chipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.playerSoft },
  lyrics: { gap: 14, marginHorizontal: -8, padding: 20, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.07)' },
  lyricsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lyricsTitle: { fontFamily: fonts.headingSemibold, fontSize: 16, color: colors.text },
  lyricsKind: { fontFamily: fonts.medium, fontSize: 12, color: colors.playerMuted },
  lines: { gap: 10, minHeight: 140 },
  line: { fontFamily: fonts.semibold, fontSize: 17, color: colors.playerFaint },
  lineActive: { fontFamily: fonts.bold, fontSize: 20, color: '#FFFFFF' },
  lineNext: { fontFamily: fonts.semibold, fontSize: 17, color: colors.playerMuted },
  plain: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, color: colors.playerSoft },
});
