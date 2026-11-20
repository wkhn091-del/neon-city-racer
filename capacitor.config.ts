/** Capacitor scaffold — `npx cap add android|ios` then `npx cap sync` after build. */
const config = {
  appId: 'com.neoncity.racer',
  appName: 'Neon City Racer',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0d1524',
    },
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
  },
}

export default config
