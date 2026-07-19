// Converted from app.json to app.config.js so the @rnmapbox/maps plugin can
// read RNMapboxMapsDownloadToken from an environment variable at build time
// instead of a hardcoded value — plain app.json is static JSON and has no
// way to reference process.env. Everything else here is unchanged from the
// old app.json.
//
// RNMAPBOX_DOWNLOAD_TOKEN must be a Mapbox *secret* (downloads:read scope)
// token, not the public EXPO_PUBLIC_MAPBOX_TOKEN used at runtime — set it as
// an EAS secret (see README/EAS build instructions), never commit it here.
module.exports = {
  expo: {
    name: 'Borla',
    slug: 'Borla',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.samsa.native',
      config: {
        googleMapsApiKey: 'YOUR_IOS_GOOGLE_MAPS_API_KEY',
      },
      infoPlist: {
        NSCameraUsageDescription:
          'Borla needs camera access so collectors can take proof-of-collection photos and customers can document their pickup.',
        NSLocationWhenInUseUsageDescription:
          'Borla needs your location to match you with nearby collectors, show live pickup tracking, and calculate accurate pricing.',
        NSMicrophoneUsageDescription:
          'Borla needs microphone access to record an optional voice note describing your pickup location.',
      },
    },
    android: {
      package: 'com.samsa.borla',
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: 'YOUR_ANDROID_GOOGLE_MAPS_API_KEY',
        },
      },
      permissions: ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'RECORD_AUDIO', 'POST_NOTIFICATIONS'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-font',
      'expo-camera',
      'expo-location',
      'expo-av',
      'expo-notifications',
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsDownloadToken: process.env.RNMAPBOX_DOWNLOAD_TOKEN,
        },
      ],
    ],
    extra: {
      eas: {
        projectId: 'b29e6c53-ee7c-4973-8bb2-0dc7868217e4',
      },
    },
    owner: 'ryna121444',
  },
};