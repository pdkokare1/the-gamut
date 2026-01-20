import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.thegamut.app',
  appName: 'The Gamut',
  webDir: 'dist', 
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#121212",
      showSpinner: false,
      androidSplashResourceName: "splash",
      iosSplashResourceName: "Default-568h@2x~iphone"
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#121212"
    }
  }
};

export default config;
