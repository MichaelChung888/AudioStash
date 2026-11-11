import { router } from 'expo-router';
import { type BottomTabBarProps, Tabs } from 'expo-router/tabs';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDownloads } from '../../api/queries.ts';
import type { LibrarySong } from '../../db/library.ts';
import { getLibraryFolder } from '../../files/library-folder.ts';
import { usePlaybackStatus, usePlayer } from '../../player/hooks.ts';
import { next, togglePlay } from '../../player/player.ts';
import { Cover, IconButton, Touchable } from '../../ui/components.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { colors, fonts, text } from '../../ui/theme.ts';

const TAB_ICONS: Record<string, IconName> = { index: 'home', search: 'search', downloads: 'download', playlists: 'playlists' };

export default function TabsLayout() {
  // First run: songs cannot be saved until a folder is chosen.
  useEffect(() => {
    void getLibraryFolder().then((folder) => {
      if (!folder) router.push('/music-folder');
    });
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="downloads" options={{ title: 'Downloads' }} />
      <Tabs.Screen name="playlists" options={{ title: 'Playlists' }} />
    </Tabs>
  );
}

function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const openDownloads = useDownloads('open').data?.length ?? 0;

  return (
    <View style={styles.bottom}>
      <MiniPlayer />
      <View role="tablist" style={[styles.tabBar, { height: 64 + insets.bottom, paddingBottom: insets.bottom }]}>
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const label = descriptors[route.key]?.options.title ?? route.name;
          const badge = route.name === 'downloads' && openDownloads > 0 ? openDownloads : null;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Touchable
              key={route.key}
              role="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${label}, ${badge} in progress` : label}
              onPress={onPress}
              style={styles.tab}
            >
              <View>
                <Icon name={TAB_ICONS[route.name] ?? 'music'} size={24} color={focused ? colors.accent : colors.textFaint} />
                {badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, focused ? styles.tabLabelFocused : null]}>{label}</Text>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

function MiniPlayer() {
  const { current } = usePlayer();
  // The bar is only mounted while a song is loaded, so the native player is not created before then.
  return current ? <MiniPlayerBar song={current} /> : null;
}

function MiniPlayerBar({ song }: { song: LibrarySong }) {
  const status = usePlaybackStatus();
  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.artist}. Open the player`}
      onPress={() => router.push('/now-playing')}
      style={styles.mini}
    >
      <Cover uri={song.coverUri} color={song.coverColor} size={40} radius={5} />
      <View style={styles.miniText}>
        <Text numberOfLines={1} style={styles.miniTitle}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={text.small}>
          {song.artist}
        </Text>
      </View>
      <IconButton icon={status.playing ? 'pause' : 'play'} label={status.playing ? 'Pause' : 'Play'} onPress={togglePlay} />
      <IconButton icon="next" label="Next song" onPress={next} />
      <View style={styles.miniTrack}>
        <View style={[styles.miniFill, { width: `${Math.min(1, progress) * 100}%` }]} />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  bottom: { backgroundColor: colors.background },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.raised, backgroundColor: colors.background },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.textFaint },
  tabLabelFocused: { fontFamily: fonts.semibold, color: colors.text },
  badge: {
    position: 'absolute',
    top: -4,
    left: 14,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.onAccent },
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingLeft: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.raised,
  },
  miniText: { flex: 1, minWidth: 0 },
  miniTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  miniTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: colors.border },
  miniFill: { height: 2, backgroundColor: colors.accent },
});
