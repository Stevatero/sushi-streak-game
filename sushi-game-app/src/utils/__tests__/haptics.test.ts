/* eslint-disable @typescript-eslint/no-require-imports */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

function load() {
  let module!: typeof import('../haptics');
  jest.isolateModules(() => {
    module = require('../haptics');
  });
  return module.haptics;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('haptics', () => {
  const originalOS = Platform.OS;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('su Android usa il motore aptico del sistema, senza il permesso VIBRATE', async () => {
    Platform.OS = 'android';
    const haptics = load();
    await flush();
    haptics.piece();
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('virtual-key');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('su Android, senza l’effetto di conferma, ripiega sulla pressione prolungata', async () => {
    Platform.OS = 'android';
    (Haptics.performAndroidHapticsAsync as jest.Mock).mockRejectedValueOnce(new Error('non supportato'));
    const haptics = load();
    await flush();
    haptics.success();
    await flush();
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(1, 'confirm');
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(2, 'long-press');
  });

  it('su iOS usa il feedback aptico nativo', async () => {
    Platform.OS = 'ios';
    const haptics = load();
    await flush();
    haptics.piece();
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it('disattivata non vibra e ricorda la scelta', async () => {
    const haptics = load();
    await flush();
    haptics.setEnabled(false);
    haptics.piece();
    haptics.undo();
    haptics.success();
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    await flush();
    expect(await AsyncStorage.getItem('pref_haptics_enabled')).toBe('false');
  });
});
