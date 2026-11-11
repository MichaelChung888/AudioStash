import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { usePlaylist, useSongs } from '../api/queries.ts';
import { addSongsToPlaylist } from '../db/mutations.ts';
import { plural } from '../lib/format.ts';
import { Button, Cover, Field, IconButton, Message, Screen, Touchable } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { colors, fonts, text } from '../ui/theme.ts';

// Picks songs from the library to add to a playlist.
export default function AddSongsScreen() {
  const { playlistId } = useLocalSearchParams<{ playlistId: string }>();
  const songs = useSongs();
  const playlist = usePlaylist(playlistId);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const inPlaylist = new Set(playlist.data?.items.map((item) => item.song.id));
  const needle = filter.trim().toLowerCase();
  const shown = (songs.data ?? []).filter(
    (song) => !needle || song.title.toLowerCase().includes(needle) || song.artist.toLowerCase().includes(needle) || song.album?.toLowerCase().includes(needle),
  );

  function toggle(songId: string) {
    const next = new Set(selected);
    if (next.has(songId)) next.delete(songId);
    else next.add(songId);
    setSelected(next);
  }

  async function add() {
    const added = await addSongsToPlaylist(playlistId, [...selected]);
    ToastAndroid.show(`Added ${plural(added, 'song')} to ${playlist.data?.playlist?.name ?? 'the playlist'}`, ToastAndroid.SHORT);
    router.back();
  }

  return (
    <Screen bottom>
      <View style={styles.topBar}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          Add to {playlist.data?.playlist?.name ?? 'playlist'}
        </Text>
      </View>
      <View style={styles.filter}>
        <Field value={filter} onChangeText={setFilter} onClear={() => setFilter('')} placeholder="Filter your library" autoCorrect={false} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(song) => song.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={songs.isPending ? undefined : <Message title={needle ? 'No songs match' : 'Your library is empty'} />}
        renderItem={({ item }) => {
          const already = inPlaylist.has(item.id);
          const checked = already || selected.has(item.id);
          return (
            <Touchable
              role="checkbox"
              accessibilityState={{ checked, disabled: already }}
              accessibilityLabel={already ? `${item.title}, already in this playlist` : `${item.title} by ${item.artist}`}
              disabled={already}
              onPress={() => toggle(item.id)}
              style={styles.row}
            >
              <Cover uri={item.coverUri} color={item.coverColor} size={44} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={text.title}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={text.secondary}>
                  {item.artist}
                </Text>
              </View>
              {checked ? <Icon name="inLibrary" size={24} color={colors.accent} /> : <View style={styles.ring} />}
            </Touchable>
          );
        }}
      />
      <View style={styles.footer}>
        <Button label={selected.size ? `Add ${plural(selected.size, 'song')}` : 'Add songs'} onPress={add} disabled={selected.size === 0} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 52, paddingHorizontal: 8 },
  title: { flex: 1, fontFamily: fonts.heading, fontSize: 20, color: colors.text },
  filter: { paddingHorizontal: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 60, paddingHorizontal: 20 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  ring: { width: 22, height: 22, margin: 1, borderRadius: 11, borderWidth: 2, borderColor: colors.radioIdle },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.divider },
});
