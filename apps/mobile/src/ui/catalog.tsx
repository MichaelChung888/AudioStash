import type { CatalogTrack, YoutubeVideo } from '@audiostash/contracts';
import { formatDuration } from '@audiostash/core';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ActivityIndicator, type StyleProp, StyleSheet, Text, ToastAndroid, View, type ViewStyle } from 'react-native';
import { errorMessage } from '../api/client.ts';
import { openAddSheet } from '../downloads/add-request.ts';
import { type PreviewState, usePreviewState } from '../player/hooks.ts';
import { togglePreview } from '../player/player.ts';
import { Cover, DownloadButton, InLibraryMark, Touchable } from './components.tsx';
import { Icon } from './Icon.tsx';
import { colors, fonts, text } from './theme.ts';

// Rows and cards for songs from charts and search, which may not be in the library yet.

function downloadTrack(track: CatalogTrack) {
  openAddSheet({ kind: 'tracks', tracks: [track] });
}

interface TrackRowProps {
  track: CatalogTrack;
  rank?: number;
  showAlbum?: boolean;
  showDuration?: boolean;
}

// A full-width song row, for the Top 50 chart on Home and song results in Search.
export function TrackRow({ track, rank, showAlbum = false, showDuration = false }: TrackRowProps) {
  const subtitle = showAlbum && track.album ? `${track.artist} · ${track.album}` : track.artist;
  const preview = usePreviewState(track.id);
  return (
    <PreviewArea track={track} preview={preview} style={styles.row}>
      {rank !== undefined ? <Text style={styles.rank}>{rank}</Text> : null}
      <PreviewCover uri={track.coverUrl} size={48} radius={6} preview={preview} />
      <View style={styles.rowText}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[text.title, styles.shrink]}>
            {track.title}
          </Text>
          {track.explicit ? <ExplicitMark /> : null}
        </View>
        <Text numberOfLines={1} style={text.secondary}>
          {subtitle}
        </Text>
      </View>
      {showDuration && track.durationSec ? <Text style={text.numeric}>{formatDuration(track.durationSec * 1000)}</Text> : null}
      {track.inLibrary ? <InLibraryMark /> : <DownloadButton label={`Download ${track.title}`} onPress={() => downloadTrack(track)} />}
    </PreviewArea>
  );
}

// A square song tile, for the sideways shelves on Home: Trending and "Because you like".
export function TrackCard({ track }: { track: CatalogTrack }) {
  const preview = usePreviewState(track.id);
  return (
    <PreviewArea track={track} preview={preview} style={styles.card}>
      <View>
        <PreviewCover uri={track.coverUrl} size={136} radius={8} preview={preview} />
        <View style={styles.cardAction}>
          {track.inLibrary ? (
            <View accessible accessibilityLabel="In your library" style={styles.cardButton}>
              <Icon name="inLibrary" size={34} color={colors.accent} />
            </View>
          ) : (
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={`Download ${track.title}`}
              onPress={() => downloadTrack(track)}
              hitSlop={6}
              style={[styles.cardButton, styles.cardDownload]}
            >
              <Icon name="download" size={18} color={colors.onAccent} strokeWidth={2.4} />
            </Touchable>
          )}
        </View>
      </View>
      <Text numberOfLines={1} style={styles.cardTitle}>
        {track.title}
      </Text>
      <Text numberOfLines={1} style={text.small}>
        {track.artist}
      </Text>
    </PreviewArea>
  );
}

// Tapping a song plays its 30-second preview. Songs without one cannot be tapped.
// The download button inside handles its own taps.
function PreviewArea({ track, preview, style, children }: { track: CatalogTrack; preview: PreviewState; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const { previewDeezerId } = track;
  if (previewDeezerId === null) return <View style={style}>{children}</View>;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={preview ? `Stop the preview of ${track.title}` : `Play a preview of ${track.title}`}
      onPress={() => togglePreview(track.id, previewDeezerId).catch((error: unknown) => ToastAndroid.show(errorMessage(error), ToastAndroid.SHORT))}
      style={style}
    >
      {children}
    </Touchable>
  );
}

// The song's cover. While its preview loads it shows a spinner, then a pause icon.
function PreviewCover({ uri, size, radius, preview }: { uri: string | null; size: number; radius: number; preview: PreviewState }) {
  return (
    <View>
      <Cover uri={uri} size={size} radius={radius} />
      {preview ? (
        <View style={[styles.previewing, { borderRadius: radius }]}>
          {preview === 'loading' ? (
            <ActivityIndicator color={colors.text} size={size > 64 ? 'large' : 'small'} />
          ) : (
            <Icon name="pause" size={Math.round(size * 0.4)} color={colors.text} />
          )}
        </View>
      ) : null}
    </View>
  );
}

// A YouTube result in Search: thumbnail, title, channel and a download button. Videos have no preview.
export function VideoRow({ video }: { video: YoutubeVideo }) {
  return (
    <View style={styles.videoRow}>
      <View>
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} contentFit="cover" recyclingKey={video.thumbnailUrl} />
        ) : (
          <View style={styles.thumbnail} />
        )}
        {video.durationSec ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(video.durationSec * 1000)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={styles.videoTitle}>
          {video.title}
        </Text>
        <Text numberOfLines={1} style={text.small}>
          {video.channel}
        </Text>
      </View>
      <DownloadButton label={`Download ${video.title}`} onPress={() => openAddSheet({ kind: 'video', video })} />
    </View>
  );
}

function ExplicitMark() {
  return (
    <View accessible accessibilityLabel="Explicit" style={styles.explicit}>
      <Text style={styles.explicitText}>E</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 60, paddingLeft: 20, paddingRight: 8 },
  rank: { width: 18, textAlign: 'center', fontFamily: fonts.headingSemibold, fontSize: 16, color: colors.textFaint },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1 },
  explicit: { width: 16, height: 16, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  explicitText: { fontFamily: fonts.bold, fontSize: 10, color: colors.textSecondary },
  card: { width: 136, gap: 4 },
  previewing: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  cardAction: { position: 'absolute', right: 6, bottom: 6 },
  cardButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cardDownload: { backgroundColor: colors.accent },
  cardTitle: { marginTop: 6, fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 72, paddingLeft: 20, paddingRight: 8 },
  thumbnail: { width: 96, height: 54, borderRadius: 6, backgroundColor: colors.raised },
  durationBadge: { position: 'absolute', right: 4, bottom: 4, paddingHorizontal: 4, borderRadius: 3, backgroundColor: 'rgba(0, 0, 0, 0.8)' },
  durationText: { fontFamily: fonts.semibold, fontSize: 10, color: colors.text },
  videoTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.text },
});
