import { act, renderHook } from '@testing-library/react-native';
import { useExclusiveModal } from '../useExclusiveModal';
import { SHEET_CLOSE_MS } from '../../components/ui/Sheet';

describe('useExclusiveModal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('apre subito la prima finestra', () => {
    const { result } = renderHook(() => useExclusiveModal<'a' | 'b'>());
    act(() => result.current.openModal('a'));
    expect(result.current.modal).toBe('a');
  });

  it('passando a un’altra finestra attende la fine della chiusura della precedente', () => {
    const { result } = renderHook(() => useExclusiveModal<'a' | 'b'>());
    act(() => result.current.openModal('a'));
    act(() => result.current.openModal('b'));
    expect(result.current.modal).toBeNull();

    act(() => jest.advanceTimersByTime(SHEET_CLOSE_MS - 10));
    expect(result.current.modal).toBeNull();
    act(() => jest.advanceTimersByTime(20));
    expect(result.current.modal).toBe('b');
  });

  it('una chiusura annulla l’apertura in attesa', () => {
    const { result } = renderHook(() => useExclusiveModal<'a' | 'b'>());
    act(() => result.current.openModal('a'));
    act(() => result.current.openModal('b'));
    act(() => result.current.closeModal());
    act(() => jest.advanceTimersByTime(SHEET_CLOSE_MS + 10));
    expect(result.current.modal).toBeNull();
  });

  it('esegue le azioni successive alla chiusura dopo la dissolvenza', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useExclusiveModal<'a'>());
    act(() => result.current.afterModalClose(fn));
    expect(fn).toHaveBeenCalledTimes(1);

    act(() => result.current.openModal('a'));
    act(() => result.current.closeModal());
    act(() => result.current.afterModalClose(fn));
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(SHEET_CLOSE_MS + 10));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('allo smontaggio annulla le azioni in attesa', () => {
    const fn = jest.fn();
    const { result, unmount } = renderHook(() => useExclusiveModal<'a'>());
    act(() => result.current.openModal('a'));
    act(() => result.current.closeModal());
    act(() => result.current.afterModalClose(fn));
    unmount();
    jest.advanceTimersByTime(SHEET_CLOSE_MS + 10);
    expect(fn).not.toHaveBeenCalled();
  });
});
