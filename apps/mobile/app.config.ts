import type { ExpoConfig } from 'expo/config';

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
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#F5B83D',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    // Background playback adds the media playback service. AudioStash never records.
    ['expo-audio', { enableBackgroundPlayback: true, recordAudioAndroid: false }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 96, backgroundColor: BACKGROUND }],
  ],
};

export default config;
