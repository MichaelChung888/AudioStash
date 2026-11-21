import type { ArtistResponse } from '@audiostash/contracts';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useArtist } from '../../../api/queries.ts';
import { formatCount } from '../../../lib/format.ts';
import { ArtistCard, DownloadAllButton, Shelf, TrackRow } from '../../../ui/catalog.tsx';
import { CatalogPage } from '../../../ui/catalog-page.tsx';
import { Cover, SectionTitle } from '../../../ui/components.tsx';
import { Repeat, TrackRowPlaceholder } from '../../../ui/placeholders.tsx';
import { colors, text } from '../../../ui/theme.ts';

const PICTURE = 168;

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const artist = useArtist(Number(id));
  return (
    <CatalogPage query={artist} placeholder={<ArtistPlaceholder />}>
      {(page) => <ArtistPage page={page} />}
    </CatalogPage>
  );
}

function ArtistPage({ page }: { page: ArtistResponse }) {
  const { artist, topTracks, related } = page;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <Cover uri={artist.pictureUrl} size={PICTURE} radius={PICTURE / 2} />
        <Text accessibilityRole="header" style={[text.screenTitle, styles.name]}>
          {artist.name}
        </Text>
        {artist.fans ? <Text style={text.secondary}>{formatCount(artist.fans)} fans</Text> : null}
      </View>

      {topTracks.length > 0 ? (
        <>
          <SectionTitle title="Popular">
            <DownloadAllButton tracks={topTracks} />
          </SectionTitle>
          {topTracks.map((track, i) => (
            <TrackRow key={track.id} track={track} rank={i + 1} showAlbum />
          ))}
        </>
      ) : null}

      {related.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Similar artists" />
          <Shelf items={related} keyOf={(similar) => String(similar.deezerId)} render={(similar) => <ArtistCard artist={similar} />} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function ArtistPlaceholder() {
  return (
    <>
      <View style={styles.identity}>
        <View style={styles.picturePlaceholder} />
      </View>
      <Repeat times={6}>
        <TrackRowPlaceholder ranked />
      </Repeat>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  identity: { alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
  picturePlaceholder: { width: PICTURE, height: PICTURE, borderRadius: PICTURE / 2, backgroundColor: colors.raised },
  name: { marginTop: 10, textAlign: 'center' },
  section: { marginTop: 16 },
});
