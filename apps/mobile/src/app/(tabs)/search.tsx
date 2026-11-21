import { parseSourceUrl } from '@audiostash/core';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { type ReactNode, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../api/client.ts';
import { useSearchSongs, useSearchYoutube } from '../../api/queries.ts';
import { openAddSheet } from '../../downloads/add-request.ts';
import { TrackRow, VideoRow } from '../../ui/catalog.tsx';
import { Field, Message, Screen, Touchable } from '../../ui/components.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { Pulse, Repeat, TrackRowPlaceholder, VideoRowPlaceholder } from '../../ui/placeholders.tsx';
import { colors, fonts, text } from '../../ui/theme.ts';

type Tab = 'songs' | 'youtube';

const SOURCE_NAMES = { youtube: 'YouTube', soundcloud: 'SoundCloud', bandcamp: 'Bandcamp', upload: 'Upload', other: 'Link' } as const;

export default function SearchScreen() {
  const [input, setInput] = useState('');
  const [tab, setTab] = useState<Tab>('songs');
  const [notice, setNotice] = useState<string | null>(null);
  const q = useDebounced(input.trim(), 350);
  const link = parseSourceUrl(input.trim());

  async function pasteLink() {
    setNotice(null);
    const pasted = parseSourceUrl((await Clipboard.getStringAsync()).trim());
    if (pasted) openAddSheet({ kind: 'link', link: pasted });
    else setNotice('There is no YouTube, SoundCloud or Bandcamp link on the clipboard.');
  }

  async function uploadFiles() {
    setNotice(null);
    // Not copied to the cache: the sheet uploads straight from where the files are.
    const picked = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'video/*'], multiple: true, copyToCacheDirectory: false });
    if (!picked.canceled && picked.assets.length > 0) openAddSheet({ kind: 'files', files: picked.assets });
  }

  return (
    <Screen>
      <Text accessibilityRole="header" style={[text.screenTitle, styles.title]}>
        Search
      </Text>
      <View style={styles.field}>
        <Field
          value={input}
          onChangeText={setInput}
          onClear={() => setInput('')}
          placeholder="Songs, artists or a link"
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={() => (link ? openAddSheet({ kind: 'link', link }) : undefined)}
        />
      </View>

      {input.trim() === '' ? (
        <View style={styles.start}>
          <View style={styles.actions}>
            <ActionButton icon="link" label="Paste link" onPress={pasteLink} />
            <ActionButton icon="upload" label="Upload files" onPress={uploadFiles} />
          </View>
          <Text style={text.secondary}>Links from YouTube, SoundCloud or Bandcamp, songs or whole playlists. Files can be audio or video from this phone.</Text>
          {notice ? <Text style={[text.secondary, { color: colors.danger }]}>{notice}</Text> : null}
        </View>
      ) : link ? (
        <Touchable accessibilityRole="button" onPress={() => openAddSheet({ kind: 'link', link })} style={styles.linkRow}>
          <View style={styles.linkTile}>
            <Icon name="link" size={22} color={colors.accent} />
          </View>
          <View style={styles.linkText}>
            <Text style={text.title}>Download this {link.kind === 'collection' ? 'playlist' : 'link'}</Text>
            <Text numberOfLines={1} style={text.secondary}>
              {SOURCE_NAMES[link.source]} · {link.url}
            </Text>
          </View>
          <Icon name="forward" size={20} color={colors.textFaint} />
        </Touchable>
      ) : (
        <>
          <View style={styles.segments} role="tablist">
            <Segment label="Songs" selected={tab === 'songs'} onPress={() => setTab('songs')} />
            <Segment label="YouTube" selected={tab === 'youtube'} onPress={() => setTab('youtube')} />
          </View>
          {tab === 'songs' ? <SongResults q={q} /> : <VideoResults q={q} />}
        </>
      )}
    </Screen>
  );
}

function SongResults({ q }: { q: string }) {
  const results = useSearchSongs(q, true);
  if (q === '' || results.isPending) return <Loading row={<TrackRowPlaceholder />} />;
  if (results.isError) return <Message title="Search failed" detail={errorMessage(results.error)} />;
  if (results.data.length === 0) return <Message title="No songs found" detail="Try the YouTube tab, or paste a link." />;
  return (
    <FlatList
      data={results.data}
      keyExtractor={(track) => track.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => <TrackRow track={item} showAlbum showDuration />}
    />
  );
}

function VideoResults({ q }: { q: string }) {
  const results = useSearchYoutube(q, true);
  if (q === '' || results.isPending) return <Loading row={<VideoRowPlaceholder />} />;
  if (results.isError) return <Message title="Search failed" detail={errorMessage(results.error)} />;
  if (results.data.length === 0) return <Message title="No videos found" />;
  return (
    <FlatList
      data={results.data}
      keyExtractor={(video) => video.videoId}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => <VideoRow video={item} />}
    />
  );
}

function Loading({ row }: { row: ReactNode }) {
  return (
    <Pulse>
      <Repeat times={6}>{row}</Repeat>
    </Pulse>
  );
}

function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Touchable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Icon name={icon} size={20} color={colors.accent} />
      <Text style={styles.actionText}>{label}</Text>
    </Touchable>
  );
}

function Segment({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Touchable role="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.segment, selected ? styles.segmentSelected : null]}>
      <Text style={[styles.segmentText, { color: selected ? colors.text : colors.textMuted }]}>{label}</Text>
    </Touchable>
  );
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

const styles = StyleSheet.create({
  title: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 12 },
  field: { paddingHorizontal: 20 },
  start: { gap: 12, padding: 20 },
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  actionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 20, padding: 12, borderRadius: 12, backgroundColor: colors.surface },
  linkTile: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  linkText: { flex: 1, minWidth: 0, gap: 2 },
  segments: { flexDirection: 'row', margin: 20, marginBottom: 8, padding: 4, borderRadius: 12, backgroundColor: colors.surface },
  segment: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.raised },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14 },
});
