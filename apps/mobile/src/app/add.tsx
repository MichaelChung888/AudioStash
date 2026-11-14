import type { DownloadOptions, DownloadSource, DownloadTarget, UploadedFile } from '@audiostash/contracts';
import { formatDuration } from '@audiostash/core';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, ToastAndroid, useWindowDimensions, View } from 'react-native';
import { errorMessage } from '../api/client.ts';
import { api } from '../api/endpoints.ts';
import { putDownload, useDefaultDownloadOptions, usePlaylists, useStatus } from '../api/queries.ts';
import { type AddRequest, getAddRequest } from '../downloads/add-request.ts';
import { sourceName } from '../downloads/describe.ts';
import { formatBytes, plural } from '../lib/format.ts';
import { Button, Cover, Field, IconButton, ProgressBar, Sheet, Touchable } from '../ui/components.tsx';
import { DownloadOptionsForm, Radio } from '../ui/download-options.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { colors, fonts, text } from '../ui/theme.ts';

type Target = { kind: 'library' } | { kind: 'playlist'; playlistId: string; name: string } | { kind: 'newPlaylist'; name: string };

export default function AddSheet() {
  const request = getAddRequest();

  useEffect(() => {
    if (!request) router.back();
  }, [request]);

  return request ? <AddForm request={request} /> : null;
}

function AddForm({ request }: { request: AddRequest }) {
  const client = useQueryClient();
  const status = useStatus();
  const defaults = useDefaultDownloadOptions();
  const window = useWindowDimensions();
  // Picked once, so sending again after a failure cannot create a second download.
  const [downloadId] = useState(() => randomUUID());
  const [newPlaylistId] = useState(() => randomUUID());
  const [options, setOptions] = useState<DownloadOptions | null>(null);
  const [target, setTarget] = useState<Target>(() => initialTarget(request));
  const [choosingTarget, setChoosingTarget] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = options ?? defaults.data ?? null;
  const online = status.data?.worker.online ?? false;
  const sponsorBlock = request.kind === 'tracks' || request.kind === 'video' || (request.kind === 'link' && request.link.source === 'youtube');
  const nameFromSource = request.kind === 'link' && request.link.kind === 'collection';
  const targetReady = target.kind !== 'newPlaylist' || nameFromSource || target.name.trim() !== '';

  async function submit() {
    if (!chosen) return;
    setError(null);
    try {
      let source: DownloadSource;
      if (request.kind === 'files') {
        setBusy('Uploading');
        source = { kind: 'upload', files: await uploadFiles(request.files, setUploadProgress) };
      } else {
        source = sourceFor(request);
      }
      setBusy('Starting');
      const created = await api.createDownload({ id: downloadId, source, options: chosen, target: toDownloadTarget(target, newPlaylistId) });
      putDownload(client, created);
      ToastAndroid.show(online ? 'Download started' : 'Download queued until your PC is online', ToastAndroid.SHORT);
      router.back();
    } catch (err) {
      setError(err instanceof UploadError ? err.message : errorMessage(err));
      setBusy(null);
      setUploadProgress(null);
    }
  }

  if (choosingTarget) {
    return (
      <Sheet onClose={() => setChoosingTarget(false)}>
        <TargetPicker
          target={target}
          nameFromSource={nameFromSource}
          onChange={setTarget}
          onDone={() => setChoosingTarget(false)}
          maxHeight={window.height * 0.7}
        />
      </Sheet>
    );
  }

  return (
    <Sheet onClose={() => (busy ? undefined : router.back())}>
      <RequestHeader request={request} />
      {chosen ? (
        <ScrollView style={{ maxHeight: window.height * 0.6 }} contentContainerStyle={styles.body}>
          <DownloadOptionsForm options={chosen} onChange={setOptions} showSkipNonMusic={sponsorBlock} />
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`Save to: ${targetLabel(target)}`}
            onPress={() => setChoosingTarget(true)}
            style={styles.saveTo}
          >
            <Icon name="playlists" size={20} color={colors.textSecondary} />
            <Text style={text.title}>Save to</Text>
            <Text numberOfLines={1} style={[text.secondary, styles.saveToValue]}>
              {targetLabel(target)}
            </Text>
            <Icon name="forward" size={18} color={colors.textFaint} />
          </Touchable>
        </ScrollView>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}

      {uploadProgress !== null ? <ProgressBar value={uploadProgress} color={colors.phone} /> : null}
      {error ? <Text style={[text.secondary, { color: colors.danger }]}>{error}</Text> : null}
      <Button label={busy ?? 'Download'} busy={busy !== null} disabled={!chosen || !targetReady} onPress={submit} />
      <Text style={[text.small, styles.note]}>
        {online ? 'Your PC is online, so this starts now.' : 'Your PC is offline. This starts when it is back online.'}
      </Text>
    </Sheet>
  );
}

function RequestHeader({ request }: { request: AddRequest }) {
  const { artwork, title, detail } = describeRequest(request);
  return (
    <View style={styles.header}>
      {artwork}
      <View style={styles.headerText}>
        <Text numberOfLines={2} style={styles.headerTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={text.secondary}>
          {detail}
        </Text>
      </View>
      <IconButton icon="close" label="Close" color={colors.textMuted} onPress={() => router.back()} />
    </View>
  );
}

function describeRequest(request: AddRequest): { artwork: ReactNode; title: string; detail: string } {
  switch (request.kind) {
    case 'tracks': {
      const [first] = request.tracks;
      if (request.tracks.length === 1 && first) {
        const parts = [first.artist, first.album, first.durationSec ? formatDuration(first.durationSec * 1000) : null].filter(Boolean);
        return { artwork: <Cover uri={first.coverUrl} size={52} />, title: first.title, detail: parts.join(' · ') };
      }
      const artists = [...new Set(request.tracks.map((t) => t.artist))].slice(0, 3).join(', ');
      return { artwork: <Cover uri={first?.coverUrl} size={52} />, title: plural(request.tracks.length, 'song'), detail: artists };
    }
    case 'video': {
      const { video } = request;
      const detail = video.durationSec ? `${video.channel} · ${formatDuration(video.durationSec * 1000)}` : video.channel;
      return { artwork: <Cover uri={video.thumbnailUrl} size={52} />, title: video.title, detail };
    }
    case 'link': {
      const name = sourceName({ sourceKind: 'url', sourceUrl: request.link.url });
      const title = request.link.kind === 'collection' ? `${name} playlist` : `${name} link`;
      return { artwork: <Tile icon="link" />, title, detail: request.link.url };
    }
    case 'files': {
      const size = request.files.reduce((sum, file) => sum + (file.size ?? 0), 0);
      return { artwork: <Tile icon="upload" />, title: `${plural(request.files.length, 'file')} from this phone`, detail: formatBytes(size) };
    }
  }
}

function Tile({ icon }: { icon: IconName }) {
  return (
    <View style={styles.tile}>
      <Icon name={icon} size={24} color={colors.accent} />
    </View>
  );
}

interface TargetPickerProps {
  target: Target;
  nameFromSource: boolean;
  onChange: (target: Target) => void;
  onDone: () => void;
  maxHeight: number;
}

function TargetPicker({ target, nameFromSource, onChange, onDone, maxHeight }: TargetPickerProps) {
  const playlists = usePlaylists();
  const newName = target.kind === 'newPlaylist' ? target.name : '';

  return (
    <>
      <View style={styles.pickerHeader}>
        <IconButton icon="back" label="Back" onPress={onDone} />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Save to
        </Text>
      </View>
      <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.choices}>
        <TargetChoice label="Your library only" selected={target.kind === 'library'} onPress={() => onChange({ kind: 'library' })} />
        <TargetChoice label="A new playlist" selected={target.kind === 'newPlaylist'} onPress={() => onChange({ kind: 'newPlaylist', name: newName })}>
          {target.kind === 'newPlaylist' ? (
            <Field
              value={newName}
              onChangeText={(name) => onChange({ kind: 'newPlaylist', name })}
              placeholder={nameFromSource ? "Leave empty to use the playlist's own name" : 'Playlist name'}
              maxLength={200}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onDone}
            />
          ) : null}
        </TargetChoice>
        {(playlists.data ?? []).map(({ playlist }) => (
          <TargetChoice
            key={playlist.id}
            label={playlist.name}
            selected={target.kind === 'playlist' && target.playlistId === playlist.id}
            onPress={() => onChange({ kind: 'playlist', playlistId: playlist.id, name: playlist.name })}
          />
        ))}
      </ScrollView>
      <Button label="Done" onPress={onDone} disabled={target.kind === 'newPlaylist' && !nameFromSource && newName.trim() === ''} />
    </>
  );
}

function TargetChoice({ label, selected, onPress, children }: { label: string; selected: boolean; onPress: () => void; children?: ReactNode }) {
  return (
    <View style={[styles.choice, styles.targetChoice, { borderColor: selected ? colors.accent : colors.divider }]}>
      <Touchable role="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={styles.targetRow}>
        <Radio selected={selected} />
        <Text numberOfLines={1} style={[text.title, styles.grow]}>
          {label}
        </Text>
      </Touchable>
      {children}
    </View>
  );
}

function initialTarget(request: AddRequest): Target {
  // A playlist link most likely means "copy this playlist".
  return request.kind === 'link' && request.link.kind === 'collection' ? { kind: 'newPlaylist', name: '' } : { kind: 'library' };
}

function targetLabel(target: Target): string {
  if (target.kind === 'library') return 'Library only';
  if (target.kind === 'playlist') return target.name;
  return target.name.trim() ? `New: ${target.name.trim()}` : 'A new playlist';
}

function toDownloadTarget(target: Target, newPlaylistId: string): DownloadTarget {
  if (target.kind === 'library') return { kind: 'library' };
  if (target.kind === 'playlist') return { kind: 'playlist', playlistId: target.playlistId };
  const name = target.name.trim();
  return name ? { kind: 'newPlaylist', playlistId: newPlaylistId, name } : { kind: 'newPlaylist', playlistId: newPlaylistId };
}

function sourceFor(request: Exclude<AddRequest, { kind: 'files' }>): DownloadSource {
  switch (request.kind) {
    case 'tracks':
      return { kind: 'catalog', tracks: request.tracks.map((track) => track.hint) };
    case 'video':
      return { kind: 'url', url: request.video.url };
    case 'link':
      return { kind: 'url', url: request.link.url };
  }
}

class UploadError extends Error {}

// Uploads one file at a time straight to storage. The PC picks them up from there.
async function uploadFiles(assets: readonly DocumentPickerAsset[], onProgress: (fraction: number) => void): Promise<UploadedFile[]> {
  const files = assets.map((asset) => {
    const file = new File(asset.uri);
    const contentType = asset.mimeType && /^(audio|video)\//.test(asset.mimeType) ? asset.mimeType : 'audio/mpeg';
    return { file, filename: asset.name, contentType, sizeBytes: asset.size ?? file.size };
  });
  const { uploads } = await api.createUploads({ files: files.map(({ filename, contentType, sizeBytes }) => ({ filename, contentType, sizeBytes })) });

  const total = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  let sent = 0;
  onProgress(0);
  for (const [i, upload] of uploads.entries()) {
    const local = files[i];
    if (!local) break;
    // The upload URL is signed for this content type, so it must be sent as given.
    const result = await local.file.upload(upload.url, { httpMethod: 'PUT', headers: { 'Content-Type': local.contentType } });
    if (result.status < 200 || result.status >= 300) throw new UploadError(`Could not upload ${local.filename} (HTTP ${result.status}).`);
    sent += local.sizeBytes;
    onProgress(total > 0 ? sent / total : (i + 1) / uploads.length);
  }
  return uploads.map(({ key, filename }) => ({ key, filename }));
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: { fontFamily: fonts.headingSemibold, fontSize: 18, color: colors.text },
  tile: { width: 52, height: 52, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  body: { gap: 10 },
  choices: { gap: 8 },
  choice: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5 },
  grow: { flex: 1, minWidth: 0 },
  saveTo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    marginTop: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  saveToValue: { flex: 1, textAlign: 'right' },
  note: { textAlign: 'center' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -12 },
  targetChoice: { gap: 10 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
