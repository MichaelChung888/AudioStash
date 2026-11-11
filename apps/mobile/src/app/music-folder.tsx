import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLibraryFolder } from '../api/queries.ts';
import { chooseAppStorage, chooseSharedFolder } from '../files/library-folder.ts';
import { runMirror } from '../files/mirror.ts';
import { Button, IconButton, Screen } from '../ui/components.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { colors, fonts, text } from '../ui/theme.ts';

// Shown on first run, and from Settings to change the folder.
export default function MusicFolderScreen() {
  const folder = useLibraryFolder();
  const [busy, setBusy] = useState(false);
  const firstRun = folder.data === null;

  async function choose(pick: () => Promise<boolean>) {
    setBusy(true);
    try {
      if (!(await pick())) return;
      void runMirror();
      router.back();
    } catch (err) {
      Alert.alert('Could not use that folder', err instanceof Error ? err.message : 'Try another folder.');
    } finally {
      setBusy(false);
    }
  }

  const current = folder.data ? (folder.data.kind === 'shared' ? folder.data.label : 'App storage') : null;

  return (
    <Screen bottom>
      <View style={styles.topBar}>
        <IconButton icon="back" label={firstRun ? 'Not now' : 'Back'} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={text.screenTitle}>
          {firstRun ? 'Where should songs go?' : 'Music folder'}
        </Text>
        <Text style={text.secondary}>
          Pluck saves every song in your library on this phone, so it plays with no connection. Playlists are saved next to them as .m3u8 files.
        </Text>
        {current ? <Text style={text.secondary}>Now: {current}</Text> : null}

        <Choice
          icon="folder"
          title="A folder in Music"
          tag="Recommended"
          detail="Pick Music and Pluck makes a Pluck folder inside it. Other music apps and your computer can see the songs, and they stay if Pluck is removed."
        >
          <Button label="Choose folder" busy={busy} onPress={() => void choose(chooseSharedFolder)} />
        </Choice>

        <Choice icon="phone" title="Inside Pluck only" detail="Only Pluck can play them, and they are deleted if Pluck is removed.">
          <Button
            label="Use app storage"
            variant="quiet"
            disabled={busy}
            onPress={() =>
              void choose(async () => {
                await chooseAppStorage();
                return true;
              })
            }
          />
        </Choice>

        {current ? (
          <Text style={text.small}>Changing the folder saves every song again in the new one. Files in the old folder stay until you delete them.</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Choice({ icon, title, tag, detail, children }: { icon: IconName; title: string; tag?: string; detail: string; children: ReactNode }) {
  return (
    <View style={styles.choice}>
      <View style={styles.choiceHeader}>
        <Icon name={icon} size={22} color={colors.accent} />
        <Text style={text.title}>{title}</Text>
        {tag ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ) : null}
      </View>
      <Text style={text.secondary}>{detail}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 52, paddingHorizontal: 8, justifyContent: 'center' },
  content: { gap: 16, paddingHorizontal: 20, paddingBottom: 24 },
  choice: { gap: 10, padding: 16, borderRadius: 14, backgroundColor: colors.surface },
  choiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.accentTint },
  tagText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.accent },
});
