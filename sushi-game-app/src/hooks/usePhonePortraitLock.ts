import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { logger } from '../utils/logger';

// Soglia Android tra telefono e schermo grande (tablet, pieghevole aperto): lato corto in dp
export const LARGE_SCREEN_MIN_DP = 600;

// Su Android il manifest non blocca l'orientamento (plugins/withAndroidLargeScreenOrientation.js): i telefoni
// restano in verticale, gli schermi grandi ruotano liberamente. Su iOS il verticale è fissato nell'Info.plist.
export function usePhonePortraitLock() {
  const { width, height } = useWindowDimensions();
  const isPhone = Math.min(width, height) < LARGE_SCREEN_MIN_DP;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const request = isPhone
      ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      : ScreenOrientation.unlockAsync();
    request.catch((e) => logger.warn('Impostazione dell’orientamento non riuscita', e));
  }, [isPhone]);
}
