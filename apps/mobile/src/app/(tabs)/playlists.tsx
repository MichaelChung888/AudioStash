import type { Download, Playlist } from '@pluck/contracts';
import { formatTotalDuration } from '@pluck/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useDownloads, useLibraryFolder, useLibraryTotals, usePlaylists } from '../../api/queries.ts';
import type { PlaylistSummary } from '../../db/library.ts';
import { createPlaylist, deletePlaylist, renamePlaylist } from '../../db/mutations.ts';
import { sourceName } from '../../downloads/describe.ts';
import { formatBytes, plural } from '../../lib/format.ts';
import { Chip, CoverGrid, Header, IconButton, Message, Screen, Touchable } from '../../ui/components.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { MenuButton } from '../../ui/menu.tsx';
import { NamePrompt } from '../../ui/name-prompt.tsx';
import { colors, fonts, text } from '../../ui/theme.ts';

type Filter = 'all' | 'mine' | 'imported';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Made by you' },
  { value: 'imported', label: 'Imported' },
];

export default function PlaylistsScreen() {
  const playlists = usePlaylists();
  const openDownloads = useDownloads('open').data ?? [];
  const [filter, setFilter] = useState<Filter>('all');
  const [naming, setNaming] = useState<{ playlist: Playlist | null } | null>(null);

  const shown = (playlists.data ?? []).filter(({ playlist }) => filter === 'all' || (filter === 'imported') === (playlist.sourceUrl !== null));
  const downloadsByPlaylist = new Map(openDownloads.filter((d) => d.playlistId).map((d) => [d.playlistId, d]));

  async function saveName(name: string) {
    const editing = naming?.playlist;
    if (editing) await renamePlaylist(editing.id, name);
    else router.push(`/playlist/${await createPlaylist(name)}`);
  }

  function confirmDelete(playlist: Playlist) {
    Alert.alert(`Delete ${playlist.name}?`, 'The songs stay in your library.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deletePlaylist(playlist.id) },
    ]);
  }

  return (
    <Screen>
      <Header title="Playlists">
        <IconButton icon="plus" label="New playlist" circle={36} size={20} onPress={() => setNaming({ playlist: null })} />
      </Header>
      <FlatList
        data={shown}
        keyExtractor={(summary) => summary.playlist.id}
        ListHeaderComponent={
          <>
            <View style={styles.filters}>
              {FILTERS.map((option) => (
                <Chip key={option.value} label={option.label} selected={filter === option.value} onPress={() => setFilter(option.value)} />
              ))}
            </View>
            <AllSongsRow />
          </>
        }
        ListEmptyComponent={
          playlists.isPending ? undefined : (
            <Message
              title={filter === 'imported' ? 'No imported playlists' : 'No playlists yet'}
              detail="Paste a playlist link in Search, or tap + to make one."
            />
          )
        }
        ListFooterComponent={<Footer />}
        renderItem={({ item }) => (
          <PlaylistRow
            summary={item}
            download={downloadsByPlaylist.get(item.playlist.id)}
            onRename={() => setNaming({ playlist: item.playlist })}
            onDelete={() => confirmDelete(item.playlist)}
          />
        )}
      />
      <NamePrompt
        visible={naming !== null}
        title={naming?.playlist ? 'Rename playlist' : 'New playlist'}
        action={naming?.playlist ? 'Rename' : 'Create'}
        initial={naming?.playlist?.name ?? ''}
        onSubmit={(name) => void saveName(name)}
        onClose={() => setNaming(null)}
      />
    </Screen>
  );
}

function AllSongsRow() {
  const totals = useLibraryTotals().data;
  return (
    <Touchable accessibilityRole="button" onPress={() => router.push('/playlist/all')} style={styles.row}>
      <View style={styles.allTile}>
        <Icon name="music" size={26} color={colors.onAccent} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.name}>All songs</Text>
        <Text style={text.secondary}>{totals ? `${plural(totals.songCount, 'song')} · ${formatTotalDuration(totals.durationMs)}` : ' '}</Text>
      </View>
    </Touchable>
  );
}

interface PlaylistRowProps {
  summary: PlaylistSummary;
  download: Download | undefined;
  onRename: () => void;
  onDelete: () => void;
}

function PlaylistRow({ summary, download, onRename, onDelete }: PlaylistRowProps) {
  const { playlist, songCount, durationMs, tiles } = summary;
  const stats = download
    ? `Downloading · ${download.counts.completed + download.counts.skipped} of ${download.counts.total || '?'}`
    : `${plural(songCount, 'song')} · ${formatTotalDuration(durationMs)}`;

  return (
    <View style={styles.rowWrap}>
      <Touchable accessibilityRole="button" onPress={() => router.push(`/playlist/${playlist.id}`)} style={[styles.row, styles.grow]}>
        <CoverGrid tiles={tiles} size={56} />
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={styles.name}>
            {playlist.name}
          </Text>
          <Text numberOfLines={1} style={[text.secondary, download ? { color: colors.accent } : null]}>
            {stats}
          </Text>
          {playlist.sourceUrl ? (
            <View style={styles.source}>
              <Icon name="link" size={12} color={colors.textFaint} />
              <Text style={text.numeric}>{sourceName({ sourceKind: 'url', sourceUrl: playlist.sourceUrl })}</Text>
            </View>
          ) : null}
        </View>
      </Touchable>
      <MenuButton
        label={`More for ${playlist.name}`}
        items={[
          { label: 'Rename', icon: 'edit', onPress: onRename },
          { label: 'Delete playlist', icon: 'trash', onPress: onDelete, danger: true, dividerBefore: true },
        ]}
      />
    </View>
  );
}

function Footer() {
  const totals = useLibraryTotals().data;
  const folder = useLibraryFolder();
  if (!totals || folder.isPending) return null;

  if (!folder.data) {
    return (
      <Touchable accessibilityRole="button" onPress={() => router.push('/music-folder')} style={styles.footer}>
        <Icon name="folder" size={16} color={colors.danger} />
        <Text style={[text.small, { color: colors.danger }]}>Choose a music folder to save songs to this phone</Text>
      </Touchable>
    );
  }

  const where = folder.data.kind === 'shared' ? folder.data.label : 'app storage';
  const onPhone =
    totals.savedCount === totals.songCount ? 'Everything here is on this phone' : `${totals.savedCount} of ${plural(totals.songCount, 'song')} on this phone`;
  return (
    <View style={styles.footer}>
      <Icon name="phone" size={16} color={colors.phone} />
      <Text style={text.small}>
        {onPhone} · {formatBytes(totals.sizeOnPhone)} in {where}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 72, paddingHorizontal: 20 },
  grow: { flex: 1, paddingRight: 0 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  allTile: { width: 56, height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  source: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 24 },
});
