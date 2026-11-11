import type { CatalogTrack, Genre } from '@pluck/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../api/client.ts';
import { keys, useCharts, useForYou, useGenres, useStatus, useTrending } from '../../api/queries.ts';
import { config } from '../../config.ts';
import { TrackCard, TrackRow } from '../../ui/catalog.tsx';
import { Button, Chip, Screen, StatusDot, Touchable } from '../../ui/components.tsx';
import { Icon, Logo } from '../../ui/Icon.tsx';
import { colors, fonts, text } from '../../ui/theme.ts';

const ALL_GENRES: Genre = { id: 0, name: 'All' };
const CHART_PREVIEW = 10;

export default function HomeScreen() {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([client.refetchQueries({ queryKey: keys.catalog, type: 'active' }), client.refetchQueries({ queryKey: keys.status })]);
    setRefreshing(false);
  }

  return (
    <Screen>
      <HomeHeader />
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
        <Charts />
        <Trending />
        <ForYou />
      </ScrollView>
    </Screen>
  );
}

function HomeHeader() {
  const status = useStatus();
  const online = status.data?.worker.online ?? false;
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <Logo size={28} />
        <Text style={styles.brandName}>Pluck</Text>
      </View>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={online ? 'Your PC is online. Open downloads' : 'Your PC is offline. Open downloads'}
        onPress={() => router.navigate('/downloads')}
        style={styles.pill}
      >
        <StatusDot online={online} />
        <Text style={styles.pillText}>{status.data ? (online ? 'PC online' : 'PC offline') : 'Checking PC'}</Text>
      </Touchable>
      <Touchable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/settings')} hitSlop={6} style={styles.avatar}>
        <Icon name="user" size={18} color={colors.textSecondary} />
      </Touchable>
    </View>
  );
}

function Charts() {
  const genres = useGenres();
  const [genre, setGenre] = useState<Genre>(ALL_GENRES);
  const [showAll, setShowAll] = useState(false);
  const charts = useCharts(genre.id);

  const genreList = genres.data ? (genres.data.some((g) => g.id === 0) ? genres.data : [ALL_GENRES, ...genres.data]) : [ALL_GENRES];
  const tracks = charts.data ?? [];

  return (
    <View>
      <FlatList
        horizontal
        data={genreList}
        keyExtractor={(g) => String(g.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => (
          <Chip
            label={item.name}
            selected={item.id === genre.id}
            onPress={() => {
              setGenre(item);
              setShowAll(false);
            }}
          />
        )}
      />
      <SectionTitle title={`Top 50 · ${genre.id === 0 ? 'All genres' : genre.name}`}>
        {tracks.length > CHART_PREVIEW ? (
          <Touchable accessibilityRole="button" onPress={() => setShowAll(!showAll)} hitSlop={8}>
            <Text style={styles.seeAll}>{showAll ? 'Show less' : 'See all'}</Text>
          </Touchable>
        ) : null}
      </SectionTitle>
      <Loadable query={charts} empty="No chart for this genre right now.">
        {(showAll ? tracks : tracks.slice(0, CHART_PREVIEW)).map((track, i) => (
          <TrackRow key={track.id} track={track} rank={i + 1} />
        ))}
      </Loadable>
    </View>
  );
}

function Trending() {
  const trending = useTrending();
  return (
    <View style={styles.section}>
      <SectionTitle title={trendingTitle(config.chartCountry)} />
      <Loadable query={trending} empty="Nothing trending right now.">
        <Shelf tracks={trending.data ?? []} />
      </Loadable>
    </View>
  );
}

function ForYou() {
  const forYou = useForYou();
  // Built from the library, so it is empty until there are a few songs to go on.
  if (!forYou.data?.length) return null;
  return forYou.data.map((section) => (
    <View key={section.title} style={styles.section}>
      <SectionTitle title={section.title} reason={section.reason} />
      <Shelf tracks={section.tracks} />
    </View>
  ));
}

function Shelf({ tracks }: { tracks: CatalogTrack[] }) {
  return (
    <FlatList
      horizontal
      data={tracks}
      keyExtractor={(track) => track.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.shelf}
      renderItem={({ item }) => <TrackCard track={item} />}
    />
  );
}

function SectionTitle({ title, reason, children }: { title: string; reason?: string; children?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionText}>
        <Text accessibilityRole="header" style={text.sectionTitle}>
          {title}
        </Text>
        {reason ? <Text style={text.secondary}>{reason}</Text> : null}
      </View>
      {children}
    </View>
  );
}

interface LoadableProps {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: readonly unknown[]; refetch: () => unknown };
  empty: string;
  children: ReactNode;
}

function Loadable({ query, empty, children }: LoadableProps) {
  if (query.isPending) return <ActivityIndicator color={colors.accent} style={styles.loading} />;
  if (query.isError)
    return (
      <View style={styles.problem}>
        <Text style={text.secondary}>{errorMessage(query.error)}</Text>
        <Button label="Try again" variant="outline" onPress={() => void query.refetch()} />
      </View>
    );
  if (!query.data?.length) return <Text style={[text.secondary, styles.problem]}>{empty}</Text>;
  return children;
}

function trendingTitle(country: string): string {
  const names: Record<string, string> = { gb: 'the UK', us: 'the US' };
  if (names[country]) return `Trending in ${names[country]}`;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(country.toUpperCase());
    return name ? `Trending in ${name}` : 'Trending';
  } catch {
    return 'Trending';
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 20 },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { fontFamily: fonts.heading, fontSize: 22, letterSpacing: -0.44, color: colors.text },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface },
  pillText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  content: { paddingBottom: 24 },
  chips: { gap: 8, paddingTop: 8, paddingHorizontal: 20 },
  section: { marginTop: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 20, paddingBottom: 10, paddingHorizontal: 20 },
  sectionText: { flex: 1, gap: 2 },
  seeAll: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
  shelf: { gap: 12, paddingHorizontal: 20 },
  loading: { paddingVertical: 32 },
  problem: { alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
});
