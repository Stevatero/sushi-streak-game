import type { RefObject } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { logger } from '../utils/logger';

export type ImageShareResult = 'shared' | 'unavailable' | 'error';

// Trasforma la card del risultato in un'immagine PNG e apre il foglio di condivisione del sistema
// (WhatsApp, Telegram, galleria…). Il file è temporaneo: il sistema lo elimina da solo.
export async function shareResultImage(view: RefObject<View | null>): Promise<ImageShareResult> {
  try {
    if (!view.current || !(await Sharing.isAvailableAsync())) return 'unavailable';
    const uri = await captureRef(view, {
      format: 'png',
      result: 'tmpfile',
      fileName: 'sushi-streak-risultato',
      // Su iOS cattura anche la parte della card fuori dallo schermo (pannello scorrevole)
      useRenderInContext: Platform.OS === 'ios',
    });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Condividi il risultato' });
    return 'shared';
  } catch (error) {
    logger.warn("Condivisione dell'immagine del risultato non riuscita", error);
    return 'error';
  }
}
