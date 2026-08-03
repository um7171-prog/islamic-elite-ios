import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.techsnds.islamicelite',
  appName: 'النخبة الإسلامية',
  webDir: 'dist',
  // NOTE: no `server.url` — the app loads the bundled `dist/` build,
  // which is required for App Store review and offline launch.
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#0a1f1a',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
