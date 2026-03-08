import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'The Avid',
  slug: 'the-avid',
  version: '0.1.0',
  orientation: 'landscape',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0f172a',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.theavid.app',
    buildNumber: '1',
    infoPlist: {
      NSCameraUsageDescription: 'Camera access for capturing media',
      NSMicrophoneUsageDescription: 'Microphone access for audio recording',
      NSPhotoLibraryUsageDescription: 'Photo library access for importing media',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f172a',
    },
    package: 'com.theavid.app',
    versionCode: 1,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-av',
    'expo-document-picker',
    'expo-file-system',
    'expo-media-library',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: 'YOUR_EAS_PROJECT_ID', // replace after `eas init`
    },
  },
});
