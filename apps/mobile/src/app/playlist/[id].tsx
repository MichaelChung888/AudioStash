import type { Playlist, PlaylistEntry } from '@audiostash/contracts';
import { formatDuration, positionBetween } from '@audiostash/core';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { usePlaylist, useSongs } from '../../api/queries.ts';
import type { LibrarySong } from '../../db/library.ts';
import { deletePlaylist, deleteSong, moveEntry, removeEntry, renamePlaylist } from '../../db/mutations.ts';
import { sourceName } from '../../downloads/describe.ts';
import { formatBytes, formatCompactDuration, formatDate } from '../../lib/format.ts';
import { usePlaybackStatus, usePlayer } from '../../player/hooks.ts';
import { type PlaySource, playSongs, setShuffle, togglePlay } from '../../player/player.ts';
import { Button, Cover, CoverGrid, type CoverTile, IconButton, Message, Screen, Touchable } from '../../ui/components.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { MenuButton } from '../../ui/menu.tsx';
import { MiniPlayer } from '../../ui/mini-player.tsx';
import { NamePrompt } from '../../ui/name-prompt.tsx';
import { PlayingBars } from '../../ui/playing-bars.tsx';
import { colors, fonts, text } from '../../ui/theme.ts';

interface Row {
  song: LibrarySong;
  entry: PlaylistEntry | null;
}

const ALL_SONGS = 'all';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === ALL_SONGS ? <AllSongs /> : <SavedPlaylist id={id} />;
}

function AllSongs() {
  const songs = useSongs();
  const rows = (songs.data ?? []).map((song) => ({ song, entry: null }));
  return <SongList source={{ id: ALL_SONGS, name: 'All songs' }} playlist={null} rows={rows} loading={songs.isPending} />;
}

function SavedPlaylist({ id }: { id: string }) {
  const query = usePlaylist(id);
  if (query.isPending) return <Screen>{null}</Screen>;
  const playlist = query.data?.playlist;
  if (!playlist)
    return (
      <Screen>
        <TopBar />
        <Message title="This playlist was deleted" action={<Button label="Go back" variant="quiet" onPress={() => router.back()} />} />
      </Screen>
    );
  const rows = (query.data?.items ?? []).map(({ song, entry }) => ({ song, entry }));
  return <SongList source={{ id, name: playlist.name }} playlist={playlist} rows={rows} loading={false} />;
}

interface SongListProps {
  source: PlaySource;
  playlist: Playlist | null;
  rows: Row[];
  loading: boolean;
}

function SongList({ source, playlist, rows, loading }: SongListProps) {
  const player = usePlayer();
  const [reordering, setReordering] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const songs = rows.map((row) => row.song);
  const isSource = player.source?.id === source.id;

  function play(start: number) {
    playSongs(songs, start, source);
  }

  function openOrPlay(index: number) {
    if (player.current?.id === rows[index]?.song.id) router.push('/now-playing');
    else play(index);
  }

  // Starts on a random song from this list that is saved on the phone.
  // Opens the song on the now-playing screen.
  function shuffle() {
    const saved = songs.filter((song) => song.fileUri !== null);
    const start = saved[Math.floor(Math.random() * saved.length)];
    if (!start) return;
    setShuffle(true);
    play(songs.indexOf(start));
    router.push('/now-playing');
  }

  function confirmDelete() {
    if (!playlist) return;
    Alert.alert(`Delete ${playlist.name}?`, 'The songs stay in your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deletePlaylist(playlist.id);
          router.back();
        },
      },
    ]);
  }

  // A fractional position between the new neighbours, so only the moved entry changes.
  function move(index: number, by: -1 | 1) {
    const entry = rows[index]?.entry;
    const target = index + by;
    if (!entry || target < 0 || target >= rows.length) return;
    const [before, after] = by === -1 ? [rows[target - 1], rows[target]] : [rows[target], rows[target + 1]];
    void moveEntry(entry.id, positionBetween(before?.entry?.position ?? null, after?.entry?.position ?? null));
  }

  const menu = playlist
    ? [
        { label: 'Rename', icon: 'edit' as const, onPress: () => setRenaming(true) },
        { label: 'Reorder songs', icon: 'reorder' as const, onPress: () => setReordering(true) },
        { label: 'Delete playlist', icon: 'trash' as const, onPress: confirmDelete, danger: true, dividerBefore: true },
      ]
    : null;

  return (
    <Screen bottom>
      <TopBar>
        {reordering ? (
          <Touchable accessibilityRole="button" onPress={() => setReordering(false)} hitSlop={10} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Touchable>
        ) : menu ? (
          <MenuButton label="Playlist options" icon="moreHorizontal" color={colors.text} items={menu} />
        ) : null}
      </TopBar>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.entry?.id ?? row.song.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Summary
            source={source}
            playlist={playlist}
            songs={songs}
            playing={isSource && player.current !== null}
            onPlay={() => (isSource && player.current ? togglePlay() : play(0))}
            onShuffle={shuffle}
          />
        }
        ListEmptyComponent={
          loading ? undefined : (
            <Message title="No songs yet" detail={playlist ? 'Tap + to add songs from your library.' : 'Download songs from Home or Search.'} />
          )
        }
        renderItem={({ item, index }) => (
          <SongRow
            row={item}
            number={index + 1}
            current={player.current?.id === item.song.id}
            playlist={playlist}
            reordering={reordering}
            isFirst={index === 0}
            isLast={index === rows.length - 1}
            onPress={() => openOrPlay(index)}
            onMove={(by) => move(index, by)}
          />
        )}
      />
      <MiniPlayer />
      {playlist ? (
        <NamePrompt
          visible={renaming}
          title="Rename playlist"
          action="Rename"
          initial={playlist.name}
          onSubmit={(name) => void renamePlaylist(playlist.id, name)}
          onClose={() => setRenaming(false)}
        />
      ) : null}
    </Screen>
  );
}

function TopBar({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      <IconButton icon="back" label="Back" onPress={() => router.back()} />
      {children}
    </View>
  );
}

interface SummaryProps {
  source: PlaySource;
  playlist: Playlist | null;
  songs: LibrarySong[];
  playing: boolean;
  onPlay: () => void;
  onShuffle: () => void;
}

function Summary({ source, playlist, songs, playing, onPlay, onShuffle }: SummaryProps) {
  const tiles: CoverTile[] = songs.slice(0, 4).map((song) => ({ uri: song.coverUri, color: song.coverColor }));
  const durationMs = songs.reduce((sum, song) => sum + song.durationMs, 0);
  const sizeOnPhone = songs.reduce((sum, song) => sum + (song.fileUri ? song.audio.sizeBytes : 0), 0);
  const origin = !playlist
    ? 'Your library'
    : playlist.sourceUrl
      ? `Imported from ${sourceName({ sourceKind: 'url', sourceUrl: playlist.sourceUrl })}`
      : 'Made by you';
  const anySaved = songs.some((song) => song.fileUri !== null);

  return (
    <View style={styles.summary}>
      <View style={styles.identity}>
        {playlist ? (
          <CoverGrid tiles={tiles} size={120} radius={10} />
        ) : (
          <View style={styles.allCover}>
            <Icon name="music" size={48} color={colors.onAccent} />
          </View>
        )}
        <View style={styles.identityText}>
          <Text style={styles.kind}>Playlist</Text>
          <Text accessibilityRole="header" numberOfLines={3} style={styles.name}>
            {source.name}
          </Text>
          <Text style={text.secondary}>{origin}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={String(songs.length)} label={songs.length === 1 ? 'song' : 'songs'} />
        <Stat value={formatCompactDuration(durationMs)} label="long" />
        <Stat value={formatBytes(sizeOnPhone)} label="on this phone" />
      </View>

      {playlist ? (
        <Text style={text.small}>
          Created {formatDate(playlist.createdAt)} · Changed {formatDate(playlist.updatedAt)}
        </Text>
      ) : null}

      <View style={styles.controls}>
        <IconButton icon="shuffle" label="Shuffle" onPress={onShuffle} disabled={!anySaved} />
        {playlist ? <IconButton icon="plusCircle" label="Add songs" onPress={() => router.push(`/add-songs?playlistId=${playlist.id}`)} /> : null}
        <View style={styles.grow} />
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause or play' : 'Play'}
          onPress={onPlay}
          disabled={!anySaved}
          round={56}
          style={styles.play}
        >
          <PlayGlyph playing={playing} />
        </Touchable>
      </View>
    </View>
  );
}

// Only mounted for the playlist that is playing, so other playlists do not follow the clock.
function PlayGlyph({ playing }: { playing: boolean }) {
  return playing ? <LivePlayGlyph /> : <Icon name="play" size={26} color={colors.onAccent} />;
}

function LivePlayGlyph() {
  const status = usePlaybackStatus();
  return <Icon name={status.playing ? 'pause' : 'play'} size={26} color={colors.onAccent} />;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      <Text style={text.small}>{label}</Text>
    </View>
  );
}

interface SongRowProps {
  row: Row;
  number: number;
  current: boolean;
  playlist: Playlist | null;
  reordering: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
  onMove: (by: -1 | 1) => void;
}

function SongRow({ row, number, current, playlist, reordering, isFirst, isLast, onPress, onMove }: SongRowProps) {
  const { song, entry } = row;
  const saved = song.fileUri !== null;

  function confirmDeleteSong() {
    Alert.alert(`Delete ${song.title}?`, 'It is removed from your library, every playlist and this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteSong(song.id) },
    ]);
  }

  const items = [
    { label: 'Add to a playlist', icon: 'plusCircle' as const, onPress: () => router.push(`/choose-playlist?songIds=${song.id}`) },
    ...(playlist && entry ? [{ label: 'Remove from this playlist', icon: 'close' as const, onPress: () => void removeEntry(entry.id) }] : []),
    { label: 'Delete from library', icon: 'trash' as const, onPress: confirmDeleteSong, danger: true, dividerBefore: true },
  ];

  return (
    <View style={styles.row}>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={saved ? `Play ${song.title} by ${song.artist}` : `${song.title} by ${song.artist}, not on this phone yet`}
        disabled={!saved}
        onPress={reordering ? undefined : onPress}
        style={styles.rowMain}
      >
        <View style={styles.number}>{current ? <PlayingBars /> : <Text style={text.numeric}>{number}</Text>}</View>
        <Cover uri={song.coverUri} color={song.coverColor} size={40} radius={5} />
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={[text.title, current ? { color: colors.accent } : null]}>
            {song.title}
          </Text>
          <Text numberOfLines={1} style={text.secondary}>
            {saved ? song.artist : `${song.artist} · Not on this phone yet`}
          </Text>
        </View>
        {reordering ? null : <Text style={text.numeric}>{formatDuration(song.durationMs)}</Text>}
      </Touchable>
      {reordering ? (
        <>
          <IconButton icon="up" label={`Move ${song.title} up`} disabled={isFirst} onPress={() => onMove(-1)} color={colors.textSecondary} />
          <IconButton icon="down" label={`Move ${song.title} down`} disabled={isLast} onPress={() => onMove(1)} color={colors.textSecondary} />
        </>
      ) : (
        <MenuButton label={`More for ${song.title}`} items={items} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 8 },
  done: { paddingHorizontal: 12 },
  doneText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accent },
  list: { paddingBottom: 32 },
  summary: { gap: 16, paddingHorizontal: 20, paddingBottom: 12 },
  identity: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  allCover: { width: 120, height: 120, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  kind: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textFaint },
  name: { fontFamily: fonts.heading, fontSize: 26, letterSpacing: -0.52, color: colors.text },
  stats: { flexDirection: 'row', gap: 8 },
  // Each tile starts at the width of its text and shares out the space left.
  // Otherwise equal tiles cut off a long length such as "1 hr 52 mins".
  stat: { flexGrow: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface },
  statValue: { fontFamily: fonts.headingSemibold, fontSize: 18, color: colors.text },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -10 },
  grow: { flex: 1 },
  play: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingLeft: 20, paddingRight: 4 },
  number: { width: 20, alignItems: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
});
