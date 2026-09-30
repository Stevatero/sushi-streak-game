import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { usePhonePortraitLock } from '../usePhonePortraitLock';

const mockDimensions = { width: 400, height: 860, scale: 1, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockDimensions,
}));

describe('usePhonePortraitLock', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('blocca il verticale sui telefoni Android', () => {
    Object.assign(mockDimensions, { width: 400, height: 860 });
    renderHook(() => usePhonePortraitLock());
    expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    expect(ScreenOrientation.unlockAsync).not.toHaveBeenCalled();
  });

  it('lascia libero l’orientamento sugli schermi grandi, anche in orizzontale', () => {
    Object.assign(mockDimensions, { width: 1280, height: 800 });
    renderHook(() => usePhonePortraitLock());
    expect(ScreenOrientation.unlockAsync).toHaveBeenCalled();
    expect(ScreenOrientation.lockAsync).not.toHaveBeenCalled();
  });

  it('non fa nulla su iOS, dove il verticale è fissato nell’Info.plist', () => {
    Platform.OS = 'ios';
    renderHook(() => usePhonePortraitLock());
    expect(ScreenOrientation.lockAsync).not.toHaveBeenCalled();
    expect(ScreenOrientation.unlockAsync).not.toHaveBeenCalled();
  });
});
