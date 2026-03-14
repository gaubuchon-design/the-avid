import { ExpoConfig, ConfigContext } from 'expo/config';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'The Avid',
  slug: 'the-avid',
  version: optionalEnv('EXPO_APP_VERSION') ?? '0.1.0',
  scheme: 'theavid',
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
    requireFullScreen: false,
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSCameraUsageDescription: 'Camera access for capturing media to import into your project',
      NSMicrophoneUsageDescription: 'Microphone access for recording audio and voiceovers',
      NSPhotoLibraryUsageDescription: 'Photo library access for importing media into your timeline',
      NSPhotoLibraryAddUsageDescription: 'Photo library write access for exporting finished edits',
      UIBackgroundModes: ['audio'],
      ITSAppUsesNonExemptEncryption: false,
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
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_IMAGES',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    [
      'expo-av',
      {
        microphonePermission:
          'Allow $(PRODUCT_NAME) to access your microphone for audio recording.',
      },
    ],
    'expo-document-picker',
    'expo-file-system',
    [
      'expo-media-library',
      { photosPermission: 'Allow $(PRODUCT_NAME) to access your photos for media import.' },
    ],
    'expo-splash-screen',
  ],
  experiments: {
    typedRoutes: true,
  },
  updates: {
    ...(optionalEnv('EXPO_UPDATES_URL') ? { url: optionalEnv('EXPO_UPDATES_URL') } : {}),
    fallbackToCacheTimeout: 30000,
    checkAutomatically: 'ON_LOAD',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    ...(optionalEnv('EXPO_EAS_PROJECT_ID')
      ? {
          eas: {
            projectId: optionalEnv('EXPO_EAS_PROJECT_ID'),
          },
        }
      : {}),
  },
});
