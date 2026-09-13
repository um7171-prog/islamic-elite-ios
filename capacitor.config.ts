import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.techsnds.islamicelite',
  appName: 'النخبة الإسلامية',
  webDir: 'dist',
  // NOTE: no `server.url` — the app loads the bundled `dist/` build,
  // which is required for App Store review and offline launch.
  ios: {
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
    // Must stay in sync with the CSS `--background` token (dark theme) and the
    // native WebViewAppearance colour, otherwise overscroll shows a black band.
    backgroundColor: '#000000',
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    LocalNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
  },
};

export default config;
