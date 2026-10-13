// Setup comune dei test: mock dei moduli nativi non disponibili in Node

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn(), remove: jest.fn() }),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));

// Archivio sicuro (Keystore/Portachiavi) simulato in memoria
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
  getStringAsync: jest.fn(() => Promise.resolve('')),
}));

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 2 },
  lockAsync: jest.fn(() => Promise.resolve()),
  unlockAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-haptics', () => ({
  AndroidHaptics: {
    Virtual_Key: 'virtual-key',
    Keyboard_Tap: 'keyboard-tap',
    Confirm: 'confirm',
    Long_Press: 'long-press',
  },
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(() => Promise.resolve('file:///tmp/sushi-streak-risultato.png')),
}));

// Disegno SVG (codice QR) sostituito da semplici View
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Mock = ({ children, ...props }: { children?: React.ReactNode }) => React.createElement(View, props, children);
  return { __esModule: true, default: Mock, Svg: Mock, Path: Mock, Rect: Mock };
});
