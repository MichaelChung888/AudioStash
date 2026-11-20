import type { ExpoConfig } from 'expo/config';
import { withReleaseSigning } from './plugins/release-signing.ts';

const BACKGROUND = '#0B0C0E';

const config: ExpoConfig = {
  name: 'AudioStash',
  slug: 'audiostash',
  scheme: 'audiostash',
  version: '0.1.0',
  platforms: ['android'],
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: BACKGROUND,
  icon: './assets/icon.png',
  android: {
    // Only matters if the app is ever published to a store, where it must be unique.
    package: 'dev.audiostash.app',
    // Set by scripts/build-release.mts. Android refuses to install a lower number over a
    // higher one, so every release counts up.
    versionCode: Number(process.env.AUDIOSTASH_VERSION_CODE ?? 1),
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#F5B83D',
    },
    predictiveBackGestureEnabled: false,
    // Only request permissions we actually use; removes "Nearby devices" prompt
    permissions: [
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ],
  },
  plugins: [
    'expo-router',
    // Background playback adds the media playback service. AudioStash never records.
    ['expo-audio', { enableBackgroundPlayback: true, recordAudioAndroid: false }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-font',
    // Opens the browser tab for Google, Apple, GitHub and Facebook sign-in.
    'expo-web-browser',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 96, backgroundColor: BACKGROUND }],
  ],
};

export default withReleaseSigning(config);
