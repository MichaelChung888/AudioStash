import type { Download } from '@audiostash/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../api/client.ts';
import { api } from '../../api/endpoints.ts';
import { useDownload, useDownloads, useLibraryFolder, useStatus } from '../../api/queries.ts';
import { downloadProgress, finishedSummary, openSummary, queueSummary, stageLabel } from '../../downloads/describe.ts';
import { useMirrorState } from '../../files/hooks.ts';
import type { LibraryFolder } from '../../files/library-folder.ts';
import type { MirrorState } from '../../files/mirror.ts';
import { formatBytes, plural } from '../../lib/format.ts';
import { Button, Header, IconButton, Message, ProgressBar, Screen, StatusDot, Touchable } from '../../ui/components.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { colors, fonts, text } from '../../ui/theme.ts';

const SOURCE_ICONS: Record<Download['sourceKind'], IconName> = { url: 'link', catalog: 'music', upload: 'upload' };

export default function DownloadsScreen() {
  const client = useQueryClient();
  const open = useDownloads('open');
  const finished = useDownloads('finished');
  const status = useStatus();
  const [refreshing, setRefreshing] = useState(false);
  const workerOnline = status.data?.worker.online ?? false;

  async function refresh() {
    setRefreshing(true);
    await client.refetchQueries({ queryKey: ['downloads'] });
    await client.refetchQueries({ queryKey: ['download'] });
    setRefreshing(false);
  }

  async function clearFinished() {
    const list = finished.data ?? [];
    await act('Could not clear the list', Promise.all(list.map((d) => api.removeDownload(d.id))));
    client.setQueryData<Download[]>(['downloads', 'finished'], []);
  }

  const nothing = open.data?.length === 0 && finished.data?.length === 0;

  return (
    <Screen>
      <Header title="Downloads">
        <IconButton icon="plus" label="Download something new" circle={36} size={20} onPress={() => router.navigate('/search')} />
      </Header>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.raised}
          />
        }
      >
        <StatusCard openDownloads={open.data ?? []} workerOnline={workerOnline} workerKnown={status.data !== undefined} />

        {open.isError || finished.isError ? <Message title="Could not load downloads" detail={errorMessage(open.error ?? finished.error)} /> : null}
        {nothing ? <Message title="No downloads yet" detail="Download songs from Home or Search, or paste a link." /> : null}

        {open.data?.length ? (
          <View style={styles.group}>
            <Text accessibilityRole="header" style={text.groupTitle}>
              In progress
            </Text>
            {open.data.map((download) => (
              <OpenCard key={download.id} download={download} workerOnline={workerOnline} />
            ))}
          </View>
        ) : null}

        {finished.data?.length ? (
          <View style={styles.group}>
            <View style={styles.groupHeader}>
              <Text accessibilityRole="header" style={text.groupTitle}>
                Finished
              </Text>
              <Touchable accessibilityRole="button" accessibilityLabel="Clear finished downloads" onPress={clearFinished} hitSlop={10}>
                <Text style={styles.clear}>Clear</Text>
              </Touchable>
            </View>
            {finished.data.map((download) => (
              <FinishedRow key={download.id} download={download} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function StatusCard({ openDownloads, workerOnline, workerKnown }: { openDownloads: Download[]; workerOnline: boolean; workerKnown: boolean }) {
  const mirror = useMirrorState();
  const folder = useLibraryFolder().data ?? null;
  const phone = phoneLine(mirror, folder);

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <IconTile icon="computer" color={colors.accent} />
        <View style={styles.grow}>
          <Text style={text.title}>Home PC</Text>
          <Text style={text.secondary}>{queueSummary(openDownloads)}</Text>
        </View>
        <View style={styles.online}>
          <StatusDot online={workerOnline} />
          <Text style={text.small}>{workerKnown ? (workerOnline ? 'Online' : 'Offline') : 'Checking'}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <Touchable disabled={!phone.onPress} onPress={phone.onPress} style={styles.statusRow}>
        <IconTile icon="phone" color={colors.phone} />
        <View style={styles.grow}>
          <View style={styles.titleLine}>
            <Text style={text.title}>This phone</Text>
            {phone.right ? <Text style={text.small}>{phone.right}</Text> : null}
          </View>
          <Text style={[text.secondary, phone.problem ? { color: colors.danger } : null]}>{phone.detail}</Text>
          {phone.progress !== null ? (
            <View style={styles.phoneBar}>
              <ProgressBar value={phone.progress} color={colors.phone} />
            </View>
          ) : null}
        </View>
      </Touchable>
    </View>
  );
}

interface PhoneLine {
  detail: string;
  right: string | null;
  progress: number | null;
  problem: boolean;
  onPress?: () => void;
}

function phoneLine(mirror: MirrorState, folder: LibraryFolder | null): PhoneLine {
  const where = folder?.kind === 'shared' ? folder.label : 'app storage';
  const chooseFolder = () => router.push('/music-folder');
  const left = mirror.total - mirror.done;
  switch (mirror.status) {
    case 'noFolder':
      return { detail: 'Choose where to save songs', right: null, progress: null, problem: true, onPress: chooseFolder };
    case 'folderMissing':
      return { detail: 'The music folder cannot be reached. Choose it again', right: null, progress: null, problem: true, onPress: chooseFolder };
    case 'saving':
      return {
        detail: `Saving ${plural(left, 'song')} to ${where}`,
        right: `${formatBytes(mirror.bytesLeft)} left`,
        progress: mirror.total > 0 ? mirror.done / mirror.total : null,
        problem: false,
      };
    case 'waitingForWifi':
      return {
        detail: `${plural(left, 'song')} waiting for Wi-Fi`,
        right: formatBytes(mirror.bytesLeft),
        progress: null,
        problem: false,
        onPress: () => router.push('/settings'),
      };
    case 'idle':
      return mirror.failed > 0
        ? { detail: `${plural(mirror.failed, 'song')} could not be saved. AudioStash tries again on the next sync`, right: null, progress: null, problem: true }
        : { detail: `Everything is saved to ${where}`, right: null, progress: null, problem: false };
  }
}

function OpenCard({ download, workerOnline }: { download: Download; workerOnline: boolean }) {
  const client = useQueryClient();
  const detail = useDownload(download.id);
  const items = detail.data?.items ?? [];
  const active = items.filter((item) => item.status === 'active');
  const waiting = download.status === 'queued';

  async function cancel() {
    await act('Could not cancel', api.cancelDownload(download.id));
    void client.invalidateQueries({ queryKey: ['downloads'] });
  }

  return (
    <View style={[styles.openCard, waiting ? styles.waitingCard : null]}>
      <View style={styles.openHeader}>
        <IconTile icon={SOURCE_ICONS[download.sourceKind]} color={colors.textSecondary} size={44} />
        <View style={styles.grow}>
          <Text numberOfLines={1} style={text.title}>
            {download.sourceKind === 'upload' ? `${plural(download.counts.total, 'file')} from this phone` : download.title}
          </Text>
          <Text numberOfLines={1} style={text.secondary}>
            {openSummary(download, items, workerOnline)}
          </Text>
        </View>
        <IconButton icon="close" label={`Cancel ${download.title}`} color={colors.textMuted} size={20} onPress={cancel} />
      </View>
      {waiting ? null : <ProgressBar value={downloadProgress(download, items)} />}
      {download.counts.total > 1
        ? active.map((item) => (
            <View key={item.id} style={styles.itemLine}>
              <Text numberOfLines={1} style={[text.small, styles.grow]}>
                {item.artist ? `${item.title} · ${item.artist}` : item.title}
              </Text>
              <Text style={[text.small, item.stage === 'downloading' ? { color: colors.accent } : null]}>{stageLabel(item)}</Text>
            </View>
          ))
        : null}
    </View>
  );
}

function FinishedRow({ download }: { download: Download }) {
  const client = useQueryClient();
  const summary = finishedSummary(download);
  const { failed } = download.counts;
  const playlistId = download.playlistId;

  async function retry() {
    await act('Could not retry', api.retryDownload(download.id));
    void client.invalidateQueries({ queryKey: ['downloads'] });
  }

  return (
    <View style={styles.finished}>
      <Touchable disabled={!playlistId} onPress={() => playlistId && router.push(`/playlist/${playlistId}`)} style={styles.finishedMain}>
        <IconTile icon={SOURCE_ICONS[download.sourceKind]} color={colors.textMuted} size={44} />
        <View style={styles.grow}>
          <Text numberOfLines={1} style={text.title}>
            {download.title}
          </Text>
          <Text numberOfLines={1} style={text.secondary}>
            {summary.saved}
            {summary.failed ? <Text style={{ color: colors.danger }}> · {summary.failed}</Text> : null}
          </Text>
          {download.error ? (
            <Text numberOfLines={2} style={[text.small, { color: colors.danger }]}>
              {download.error}
            </Text>
          ) : null}
        </View>
      </Touchable>
      {failed > 0 && download.status !== 'cancelled' ? <Button label={`Retry ${failed}`} variant="outline" onPress={retry} /> : null}
    </View>
  );
}

function IconTile({ icon, color, size = 36 }: { icon: IconName; color: string; size?: number }) {
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Icon name={icon} size={size * 0.55} color={color} />
    </View>
  );
}

async function act(failure: string, action: Promise<unknown>): Promise<void> {
  try {
    await action;
  } catch (err) {
    Alert.alert(failure, errorMessage(err));
  }
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingHorizontal: 20, paddingBottom: 24 },
  card: { borderRadius: 14, backgroundColor: colors.surface },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divider: { height: 1, marginHorizontal: 14, backgroundColor: colors.divider },
  phoneBar: { marginTop: 8 },
  tile: { borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  group: { gap: 12 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
  openCard: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.surface },
  waitingCard: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: 'transparent' },
  openHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  finished: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  finishedMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
