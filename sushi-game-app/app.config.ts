import type { ConfigContext, ExpoConfig } from 'expo/config';
import { version } from './package.json';

/**
 * Configurazione Expo dinamica.
 *
 * APP_VARIANT seleziona l'ambiente (impostato dai profili in eas.json):
 * - development: build di sviluppo con dev client, installabile accanto alla versione pubblicata
 * - preview:     build interna di test (APK), installabile accanto alla versione pubblicata
 * - production:  build per Google Play e App Store (default se la variabile non è impostata)
 *
 * L'app è la stessa su Android e iOS: bundle identifier iOS = application ID Android.
 * La versione dell'app (versionName) viene letta da package.json, unica fonte di verità.
 * Il versionCode Android è gestito da EAS (appVersionSource "remote" + autoIncrement). Le build
 * fuori da EAS (workflow "APK Android") lo passano in ANDROID_VERSION_CODE, ricavato dalla versione.
 */
type AppVariant = 'development' | 'preview' | 'production';

const VARIANTS: readonly AppVariant[] = ['development', 'preview', 'production'];
const envVariant = process.env.APP_VARIANT as AppVariant | undefined;
const APP_VARIANT: AppVariant = envVariant && VARIANTS.includes(envVariant) ? envVariant : 'production';
const IS_PRODUCTION = APP_VARIANT === 'production';

const BASE_ID = 'com.stevatero.sushistreakapp';
const PUBLIC_HOST = 'sushi.dietalab.net';
const BRAND_COLOR = '#3E2843';

const variantConfig = {
  development: { name: 'Sushi Streak (Dev)', idSuffix: '.dev', scheme: 'sushi-streak-dev' },
  preview: { name: 'Sushi Streak (Preview)', idSuffix: '.preview', scheme: 'sushi-streak-preview' },
  production: { name: 'Sushi Streak', idSuffix: '', scheme: 'sushi-streak' },
}[APP_VARIANT];

const applicationId = `${BASE_ID}${variantConfig.idSuffix}`;
const versionCode = Number(process.env.ANDROID_VERSION_CODE) || undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variantConfig.name,
  slug: 'sushi-streak-app', // collegato al progetto EAS: non modificare
  owner: 'stevatero',
  version,
  description:
    "Sfida i tuoi amici e scopri chi è il vero campione di sushi! Un'app per tenere traccia di chi mangia più sushi durante una cena.",
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  scheme: variantConfig.scheme,
  ios: {
    // Interfaccia pensata per il telefono: su iPad l'app gira in modalità iPhone (solo verticale)
    supportsTablet: false,
    bundleIdentifier: applicationId,
    config: { usesNonExemptEncryption: false },
    // Universal Links (https://sushi.dietalab.net/join/...) riservati alla build di produzione: il
    // server li conferma con /.well-known/apple-app-site-association (variabile APPLE_TEAM_ID)
    ...(IS_PRODUCTION ? { associatedDomains: [`applinks:${PUBLIC_HOST}`] } : {}),
    infoPlist: {
      // Testi di sistema (es. foglio di condivisione) nella lingua del dispositivo, italiano di base
      CFBundleDevelopmentRegion: 'it',
      CFBundleAllowMixedLocalizations: true,
      // I dati locali includono i token delle partite: esclusi dal backup iCloud (come su Android)
      RCTAsyncStorageExcludeFromBackup: true,
    },
  },
  android: {
    package: applicationId,
    ...(versionCode ? { versionCode } : {}),
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: BRAND_COLOR,
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    // I dati locali includono i token delle partite: niente backup cloud o trasferimento dispositivo
    allowBackup: false,
    permissions: ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.VIBRATE',
      // Servizi in foreground di expo-audio non utilizzati (vedi plugins/withoutUnusedAudioServices.js)
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ],
    // Gli App Links verificati (https) sono riservati alla build di produzione
    intentFilters: IS_PRODUCTION
      ? [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [{ scheme: 'https', host: PUBLIC_HOST, pathPrefix: '/join' }],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ]
      : [],
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: BRAND_COLOR,
      },
    ],
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false }],
    './plugins/withoutUnusedAudioServices',
    'expo-font',
    'expo-asset',
    [
      'expo-build-properties',
      {
        android: {
          // R8: offuscamento e riduzione del codice; rimozione delle risorse inutilizzate
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
  ],
  extra: {
    appVariant: APP_VARIANT,
    eas: {
      projectId: '2bc7c94c-ecc7-4963-906d-fa506812a18a',
    },
  },
});
