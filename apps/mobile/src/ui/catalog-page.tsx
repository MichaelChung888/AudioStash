import type { UseQueryResult } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '../api/client.ts';
import { Button, IconButton, Message, Screen } from './components.tsx';
import { MiniPlayer } from './mini-player.tsx';
import { Pulse } from './placeholders.tsx';

// The frame of a page about something outside the library, such as an artist: a back
// button, the page once its query has loaded, and the mini player. The page brings its
// own scrolling list, so a long one can draw only the rows on screen.
export function CatalogPage<T>({ query, placeholder, children }: { query: UseQueryResult<T>; placeholder: ReactNode; children: (data: T) => ReactNode }) {
  return (
    <Screen bottom>
      <View style={styles.topBar}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
      </View>
      <View style={styles.body}>
        {query.isPending ? (
          <Pulse>{placeholder}</Pulse>
        ) : query.isError ? (
          <Message
            title="Could not load this page"
            detail={errorMessage(query.error)}
            action={<Button label="Try again" variant="outline" onPress={() => void query.refetch()} />}
          />
        ) : (
          children(query.data)
        )}
      </View>
      <MiniPlayer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 52, justifyContent: 'center', paddingHorizontal: 8 },
  body: { flex: 1 },
});
