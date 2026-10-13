import { Linking, Platform } from 'react-native';
import { IOS_APP_STORE_URL, PLAY_STORE_APP_URL, PLAY_STORE_URL } from '../config';
import { logger } from './logger';

// Apre la pagina dell'app nello store per aggiornarla: l'app Play Store su Android (o il sito, se manca),
// l'App Store su iPhone quando l'app sarà pubblicata. false se non è stato possibile aprirla
export async function openAppStore(): Promise<boolean> {
  const urls = Platform.OS === 'ios' ? [IOS_APP_STORE_URL].filter(Boolean) : [PLAY_STORE_APP_URL, PLAY_STORE_URL];
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch (error) {
      logger.debug('Apertura dello store non riuscita', { url, message: String(error) });
    }
  }
  return false;
}
