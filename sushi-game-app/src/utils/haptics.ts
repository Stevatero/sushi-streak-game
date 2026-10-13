// Vibrazione leggera al tocco dei pulsanti di gioco.
// Su Android usa il motore aptico del sistema (View.performHapticFeedback): non serve il permesso
// VIBRATE, che resta bloccato, e segue l'impostazione "feedback al tocco" del telefono.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { preferences } from '../services/preferences';

let enabled = true;
preferences.getHapticsEnabled().then((value) => {
  enabled = value;
});

// Gli errori (es. un effetto non disponibile sui vecchi Android) non devono mai disturbare il gioco
function run(effect: () => Promise<void>, fallback?: () => Promise<void>) {
  if (!enabled) return;
  effect().catch(() => fallback?.().catch(() => undefined));
}

const android = (type: Haptics.AndroidHaptics) => () => Haptics.performAndroidHapticsAsync(type);

export const haptics = {
  isEnabled: () => enabled,
  setEnabled(value: boolean) {
    enabled = value;
    preferences.setHapticsEnabled(value);
  },
  // Pezzo aggiunto
  piece() {
    if (Platform.OS === 'android') run(android(Haptics.AndroidHaptics.Virtual_Key));
    else run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  // Pezzo annullato
  undo() {
    if (Platform.OS === 'android') run(android(Haptics.AndroidHaptics.Keyboard_Tap));
    else run(() => Haptics.selectionAsync());
  },
  // Vittoria o fine partita (Confirm esiste da Android 11: prima si usa la pressione prolungata)
  success() {
    if (Platform.OS === 'android') {
      run(android(Haptics.AndroidHaptics.Confirm), android(Haptics.AndroidHaptics.Long_Press));
    } else {
      run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    }
  },
};
