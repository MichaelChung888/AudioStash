import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { LibrarySong } from '../db/library.ts';
import { usePlaybackStatus, usePlayer } from '../player/hooks.ts';
import { next, togglePlay } from '../player/player.ts';
import { Cover, IconButton, Touchable } from './components.tsx';
import { colors, fonts, text } from './theme.ts';

// The bar for the song playing now, shown above the tabs and at the bottom of playlists.
// Tapping it opens the full player.
export function MiniPlayer() {
  const { current } = usePlayer();
  // The bar is only mounted while a song is loaded, so the native player is not created before then.
  return current ? <MiniPlayerBar song={current} /> : null;
}

function MiniPlayerBar({ song }: { song: LibrarySong }) {
  const status = usePlaybackStatus();
  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.artist}. Open the player`}
      onPress={() => router.push('/now-playing')}
      style={styles.mini}
    >
      <Cover uri={song.coverUri} color={song.coverColor} size={40} radius={5} />
      <View style={styles.miniText}>
        <Text numberOfLines={1} style={styles.miniTitle}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={text.small}>
          {song.artist}
        </Text>
      </View>
      <IconButton icon={status.playing ? 'pause' : 'play'} label={status.playing ? 'Pause' : 'Play'} onPress={togglePlay} />
      <IconButton icon="next" label="Next song" onPress={next} />
      <View style={styles.miniTrack}>
        <View style={[styles.miniFill, { width: `${Math.min(1, progress) * 100}%` }]} />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingLeft: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.raised,
  },
  miniText: { flex: 1, minWidth: 0 },
  miniTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  miniTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: colors.border },
  miniFill: { height: 2, backgroundColor: colors.accent },
});
