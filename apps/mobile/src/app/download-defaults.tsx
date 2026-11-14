import type { DownloadOptions } from '@audiostash/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { keys, useDefaultDownloadOptions } from '../api/queries.ts';
import { setDefaultDownloadOptions } from '../db/settings.ts';
import { IconButton, Screen } from '../ui/components.tsx';
import { DownloadOptionsForm } from '../ui/download-options.tsx';
import { colors, fonts, text } from '../ui/theme.ts';

export default function DownloadDefaultsScreen() {
  const client = useQueryClient();
  const options = useDefaultDownloadOptions().data;

  async function save(next: DownloadOptions) {
    client.setQueryData(keys.downloadOptions, next);
    await setDefaultDownloadOptions(next);
  }

  return (
    <Screen bottom>
      <View style={styles.topBar}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={styles.title}>
          Download defaults
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={text.secondary}>Every new download starts with these. You can still change them for each download.</Text>
        {options ? <DownloadOptionsForm options={options} onChange={(next) => void save(next)} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 52, paddingHorizontal: 8 },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  content: { gap: 16, paddingHorizontal: 20, paddingBottom: 24 },
});
