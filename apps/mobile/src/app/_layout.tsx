import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
// One import per weight: the packages' main entry pulls in every weight, which adds megabytes to the APK.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { keys } from '../api/queries.ts';
import { config } from '../config.ts';
import { onLibraryChanged, openDatabase } from '../db/database.ts';
import { startSession } from '../session.ts';
import { colors } from '../ui/theme.ts';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// Screens read the local database through queries under ['local']; refresh them on every change.
onLibraryChanged(() => void queryClient.invalidateQueries({ queryKey: keys.local }));

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
  const [databaseOpen, setDatabaseOpen] = useState(false);

  useEffect(() => {
    openDatabase().then(
      () => setDatabaseOpen(true),
      (err: unknown) => console.error('Could not open the database:', err),
    );
  }, []);

  if (!fontsLoaded || !databaseOpen) return null;

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={config.clerkPublishableKey} tokenCache={tokenCache}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Navigator />
        </QueryClientProvider>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const { isLoaded, isSignedIn } = useAuth();
  const signedIn = isSignedIn === true;

  useEffect(() => {
    if (isLoaded) void SplashScreen.hideAsync();
  }, [isLoaded]);

  if (!isLoaded) return null;

  return (
    <>
      {signedIn ? <Session /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="playlist/[id]" />
          <Stack.Screen name="catalog/artist/[id]" />
          <Stack.Screen name="add-songs" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="download-defaults" />
          <Stack.Screen name="music-folder" />
          <Stack.Screen name="now-playing" options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: colors.player } }} />
          <Stack.Screen name="add" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen
            name="choose-playlist"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function Session() {
  const client = useQueryClient();
  useEffect(() => startSession(client), [client]);
  return null;
}
