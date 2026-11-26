module.exports = {
  name: 'Tapfolio',
  slug: 'tapfolio',
  version: '1.0.0',
  platforms: ['android'],
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.tapfolio.cards',
    allowBackup: false,
  },
  plugins: [
    'expo-secure-store',
    ['expo-image-picker', { cameraPermission: false, microphonePermission: false }],
    ['expo-build-properties', {
      android: { usesCleartextTraffic: process.env.TAPFOLIO_ALLOW_HTTP === '1' },
    }],
  ],
}
