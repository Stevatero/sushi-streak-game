import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { SessionStorageService, STORAGE_KEYS } from './sessionStorage';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEYS = {
  theme: 'pref_theme',
  sound: 'pref_sound_enabled',
  playerName: 'playerName',
  legacyServerUrl: 'serverBaseUrl',
};

async function read(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    logger.warn(`Impossibile leggere la preferenza ${key}`, error);
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    logger.warn(`Impossibile salvare la preferenza ${key}`, error);
  }
}

export const preferences = {
  async getTheme(): Promise<ThemePreference> {
    const value = await read(KEYS.theme);
    return value === 'light' || value === 'dark' ? value : 'system';
  },
  setTheme: (value: ThemePreference) => write(KEYS.theme, value),

  async getSoundEnabled(): Promise<boolean> {
    return (await read(KEYS.sound)) !== 'false';
  },
  setSoundEnabled: (enabled: boolean) => write(KEYS.sound, String(enabled)),

  getPlayerName: () => read(KEYS.playerName),
  setPlayerName: (name: string) => write(KEYS.playerName, name),

  // Rimuove l'URL del server salvato in cache dalle versioni precedenti
  async clearLegacyKeys() {
    try {
      await AsyncStorage.removeItem(KEYS.legacyServerUrl);
    } catch {
      // ignorato
    }
  },

  // Cancella tutti i dati salvati dall'app su questo dispositivo (storico, nome, preferenze, partita attiva).
  // Con keepActiveSession la partita in corso resta riprendibile.
  async clearAllLocalData({ keepActiveSession = false }: { keepActiveSession?: boolean } = {}) {
    const keys = await AsyncStorage.getAllKeys();
    const ownKeys = keys.filter(
      (k) =>
        (Object.values(KEYS).includes(k) ||
          Object.values(STORAGE_KEYS).includes(k as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]) ||
          k.includes('_corrupted_')) &&
        !(keepActiveSession && k === STORAGE_KEYS.activeSession)
    );
    await AsyncStorage.multiRemove(ownKeys);
    if (!keepActiveSession) await SessionStorageService.clearActiveSession();
  },
};
