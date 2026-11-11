import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { usePlaylists } from '../api/queries.ts';
import { addSongsToPlaylist, createPlaylist } from '../db/mutations.ts';
import { plural } from '../lib/format.ts';
import { Button, CoverGrid, Field, Sheet, Touchable } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { colors, fonts, text } from '../ui/theme.ts';

// Adds library songs to a playlist. songIds is a comma-separated list.
export default function ChoosePlaylistSheet() {
  const { songIds = '' } = useLocalSearchParams<{ songIds: string }>();
  const ids = songIds.split(',').filter(Boolean);
  const playlists = usePlaylists();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  async function addTo(playlistId: string, playlistName: string) {
    const added = await addSongsToPlaylist(playlistId, ids);
    ToastAndroid.show(added === 0 ? `Already in ${playlistName}` : `Added to ${playlistName}`, ToastAndroid.SHORT);
    router.back();
  }

  async function createAndAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addTo(await createPlaylist(trimmed), trimmed);
  }

  return (
    <Sheet onClose={() => router.back()}>
      <Text accessibilityRole="header" style={styles.title}>
        Add {ids.length === 1 ? 'to a playlist' : `${plural(ids.length, 'song')} to a playlist`}
      </Text>

      {naming ? (
        <View style={styles.form}>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            autoFocus
            maxLength={200}
            returnKeyType="done"
            onSubmitEditing={createAndAdd}
          />
          <Button label="Create and add" onPress={createAndAdd} disabled={!name.trim()} />
        </View>
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          <Touchable accessibilityRole="button" onPress={() => setNaming(true)} style={styles.row}>
            <View style={styles.newTile}>
              <Icon name="plus" size={22} color={colors.accent} />
            </View>
            <Text style={text.title}>New playlist</Text>
          </Touchable>
          {(playlists.data ?? []).map(({ playlist, songCount, tiles }) => (
            <Touchable key={playlist.id} accessibilityRole="button" onPress={() => void addTo(playlist.id, playlist.name)} style={styles.row}>
              <CoverGrid tiles={tiles} size={44} radius={6} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={text.title}>
                  {playlist.name}
                </Text>
                <Text style={text.secondary}>{plural(songCount, 'song')}</Text>
              </View>
            </Touchable>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.headingSemibold, fontSize: 18, color: colors.text },
  form: { gap: 12 },
  list: { maxHeight: 420 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 60 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  newTile: { width: 44, height: 44, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
});
