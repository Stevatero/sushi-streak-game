import Constants from 'expo-constants';

// Configurazione centralizzata dell'app.
// In sviluppo si può puntare a un backend locale creando un file .env con:
//   EXPO_PUBLIC_API_URL=http://<ip-del-pc>:3000
const DEFAULT_API_URL = 'https://sushi.dietalab.net';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');

// Il link di invito punta sempre al dominio pubblico, così funziona anche fuori dalla rete locale
export const PUBLIC_URL = (process.env.EXPO_PUBLIC_PUBLIC_URL || DEFAULT_API_URL).replace(/\/+$/, '');

export const PRIVACY_POLICY_URL = `${PUBLIC_URL}/privacy`;

export type AppVariant = 'development' | 'preview' | 'production';

export const APP_VARIANT: AppVariant = (Constants.expoConfig?.extra?.appVariant as AppVariant) ?? 'production';
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

// Dove aggiornare l'app quando il server richiede una versione più recente
const ANDROID_PACKAGE = Constants.expoConfig?.android?.package ?? 'com.stevatero.sushistreakapp';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const PLAY_STORE_APP_URL = `market://details?id=${ANDROID_PACKAGE}`;
// Pagina dell'App Store (facoltativa finché l'app iOS non è pubblicata)
export const IOS_APP_STORE_URL = process.env.EXPO_PUBLIC_IOS_APP_STORE_URL || '';

export const REQUEST_TIMEOUT_MS = 15000;

// Regole condivise con il backend
export const SESSION_CODE_MAX_LENGTH = 20;
export const SESSION_CODE_MIN_LENGTH = 3;
// Sotto questa lunghezza un codice scelto a mano è facile da indovinare: l'app lo segnala
export const SESSION_CODE_SAFE_LENGTH = 5;
export const PLAYER_NAME_MAX_LENGTH = 20;
export const RESTAURANT_NAME_MAX_LENGTH = 60;
