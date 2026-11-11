import { useAuth, useUser } from '@clerk/expo';
import type { Session } from '@pluck/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../api/client.ts';
import { api } from '../api/endpoints.ts';
import { keys, useDefaultDownloadOptions, useLibraryFolder, useLibraryTotals, useMobileDataAllowed, useSessions, useStatus } from '../api/queries.ts';
import { setSetting } from '../db/settings.ts';
import { runMirror } from '../files/mirror.ts';
import { formatAgo, formatBytes } from '../lib/format.ts';
import { signOutOfPhone } from '../session.ts';
import { Button, IconButton, Screen, Toggle, Touchable } from '../ui/components.tsx';
import { extrasSummary, formatTitle } from '../ui/download-options.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { colors, fonts, text } from '../ui/theme.ts';

export default function SettingsScreen() {
  const client = useQueryClient();
  const { signOut } = useAuth();

  function confirmSignOut() {
    Alert.alert('Sign out of this phone?', 'Songs stay in the music folder. Signing in again picks up where you left off.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOutOfPhone(client, () => signOut()) },
    ]);
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={styles.title}>
          Settings
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Profile />
        <Devices />
        <Downloads />
        <ThisPhone />
        <Button label="Sign out of this phone" variant="danger" onPress={confirmSignOut} style={styles.signOut} />
      </ScrollView>
    </Screen>
  );
}

function Profile() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  return (
    <View style={styles.profile}>
      <View style={styles.avatar}>
        <Icon name="user" size={26} color={colors.onAccent} />
      </View>
      <View style={styles.grow}>
        <Text numberOfLines={1} style={styles.name}>
          {user?.fullName || email || 'Signed in'}
        </Text>
        <Text style={text.secondary}>Signed in with Clerk</Text>
      </View>
    </View>
  );
}

function Devices() {
  const client = useQueryClient();
  const sessions = useSessions();

  function confirmRevoke(session: Session) {
    Alert.alert(`Sign out ${session.device ?? 'this device'}?`, 'It stops reaching your library within seconds.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.revokeSession(session.id);
          } catch (err) {
            Alert.alert('Could not sign it out', errorMessage(err));
          }
          void client.invalidateQueries({ queryKey: keys.sessions });
        },
      },
    ]);
  }

  return (
    <Group title="Signed-in devices" note="Signing a device out stops it reaching your library within seconds.">
      {sessions.isError ? <Text style={[text.secondary, styles.cardMessage]}>{errorMessage(sessions.error)}</Text> : null}
      {(sessions.data ?? []).map((session, i) => (
        <Row
          key={session.id}
          icon="phone"
          divider={i > 0}
          title={session.device ?? 'Unknown device'}
          detail={[session.location, formatAgo(session.lastActiveAt)].filter(Boolean).join(' · ')}
        >
          {session.current ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>This device</Text>
            </View>
          ) : (
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={`Sign out ${session.device ?? 'device'}`}
              onPress={() => confirmRevoke(session)}
              hitSlop={10}
            >
              <Text style={styles.danger}>Sign out</Text>
            </Touchable>
          )}
        </Row>
      ))}
    </Group>
  );
}

function Downloads() {
  const status = useStatus().data;
  const options = useDefaultDownloadOptions().data;
  const worker = status?.worker;
  const seen = worker?.lastSeenAt ? `seen ${formatAgo(worker.lastSeenAt)}` : 'never seen';
  const pcDetail = !worker ? 'Checking' : worker.online ? `Online, ${seen}` : `Offline, ${seen}`;
  const openDefaults = () => router.push('/download-defaults');

  return (
    <Group title="Downloads">
      <Row icon="computer" title="Home PC" detail={pcDetail} />
      <Row icon="music" divider title="Default format" onPress={openDefaults}>
        <Value text={options ? formatTitle(options.format) : ''} />
      </Row>
      <Row icon="plusCircle" divider title="Always add" onPress={openDefaults}>
        <Value text={options ? extrasSummary(options) : ''} />
      </Row>
    </Group>
  );
}

function ThisPhone() {
  const client = useQueryClient();
  const folder = useLibraryFolder().data;
  const totals = useLibraryTotals().data;
  const mobileData = useMobileDataAllowed().data ?? false;
  const where = folder === undefined ? '' : folder === null ? 'Not chosen' : folder.kind === 'shared' ? folder.label : 'App storage';

  async function setMobileData(allowed: boolean) {
    await setSetting('mobileData', allowed ? 'on' : 'off');
    await client.invalidateQueries({ queryKey: keys.mobileData });
    // Songs that were waiting for Wi-Fi can start now.
    if (allowed) void runMirror();
  }

  return (
    <Group title="This phone">
      <Row
        icon="folder"
        title="Music folder"
        detail={totals && folder ? `${where} · ${formatBytes(totals.sizeOnPhone)}` : where}
        onPress={() => router.push('/music-folder')}
      >
        <Icon name="forward" size={18} color={colors.textFaint} />
      </Row>
      <Row
        icon="download"
        divider
        title="Save songs over mobile data"
        detail={mobileData ? 'On: songs save on any connection' : 'Off: new songs wait for Wi-Fi'}
      >
        <Toggle label="Save songs over mobile data" value={mobileData} onChange={(allowed) => void setMobileData(allowed)} />
      </Row>
    </Group>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={text.label}>
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
      {note ? <Text style={text.small}>{note}</Text> : null}
    </View>
  );
}

interface RowProps {
  icon: IconName;
  title: string;
  detail?: string;
  divider?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}

function Row({ icon, title, detail, divider = false, onPress, children }: RowProps) {
  return (
    <Touchable disabled={!onPress} onPress={onPress} style={[styles.row, divider ? styles.rowDivider : null]}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.grow}>
        <Text style={text.title}>{title}</Text>
        {detail ? (
          <Text numberOfLines={2} style={text.secondary}>
            {detail}
          </Text>
        ) : null}
      </View>
      {children}
    </Touchable>
  );
}

function Value({ text: value }: { text: string }) {
  return (
    <View style={styles.value}>
      <Text numberOfLines={1} style={text.secondary}>
        {value}
      </Text>
      <Icon name="forward" size={18} color={colors.textFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 52, paddingHorizontal: 8 },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  content: { gap: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  name: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  group: { gap: 8 },
  card: { borderRadius: 14, backgroundColor: colors.surface },
  cardMessage: { padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.accentTint },
  tagText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.accent },
  danger: { fontFamily: fonts.semibold, fontSize: 14, color: colors.danger },
  value: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '50%' },
  signOut: { alignSelf: 'center' },
});
