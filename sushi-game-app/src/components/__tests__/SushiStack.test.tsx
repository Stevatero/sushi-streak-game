/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Image } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import SushiStack from '../SushiStack';
import { MAX_BODIES } from '../sushiStack/physics';

const mockSetActive = jest.fn();

// La fisica è coperta dai suoi test: qui si verifica la sincronizzazione tra punteggio e pezzi
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useRef } = require('react');
  return {
    ...mock,
    useSharedValue: (init: unknown) => {
      const ref = useRef(null);
      if (!ref.current) ref.current = { value: init, modify: () => undefined };
      return ref.current;
    },
    useFrameCallback: () => ({ setActive: mockSetActive, isActive: false, callbackId: 1 }),
  };
});
jest.mock('react-native-worklets', () => ({
  ...jest.requireActual('react-native-worklets'),
  scheduleOnUI: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

const renderStack = (pieceCount: number) => {
  const result = render(<SushiStack pieceCount={pieceCount} />);
  fireEvent(screen.getByTestId('sushi-stack'), 'layout', { nativeEvent: { layout: { width: 390, height: 780 } } });
  return result;
};

const pieces = () => screen.UNSAFE_queryAllByType(Image).length;

describe('SushiStack', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSetActive.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aggiunge un pezzo per ogni punto e avvia la simulazione', () => {
    const { rerender } = renderStack(0);
    expect(pieces()).toBe(0);

    rerender(<SushiStack pieceCount={1} />);
    expect(pieces()).toBe(1);
    expect(mockSetActive).toHaveBeenLastCalledWith(true);

    rerender(<SushiStack pieceCount={2} />);
    expect(pieces()).toBe(2);
  });

  it('quando i pezzi da aggiungere sono tanti li fa cadere uno alla volta', () => {
    renderStack(5);
    expect(pieces()).toBe(1);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(pieces()).toBe(5);
  });

  it("toglie l'ultimo pezzo quando il punteggio scende", () => {
    const { rerender } = renderStack(3);
    act(() => {
      jest.runOnlyPendingTimers();
      jest.runOnlyPendingTimers();
    });
    expect(pieces()).toBe(3);

    rerender(<SushiStack pieceCount={2} />);
    expect(pieces()).toBe(2);
    rerender(<SushiStack pieceCount={0} />);
    expect(pieces()).toBe(0);
  });

  it(`mostra al massimo ${MAX_BODIES} pezzi anche con punteggi alti`, () => {
    const { rerender } = renderStack(150);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(pieces()).toBe(MAX_BODIES);

    rerender(<SushiStack pieceCount={151} />);
    expect(pieces()).toBe(MAX_BODIES);
    // Annullando si tolgono i pezzi più recenti, senza ricreare quelli già scartati
    rerender(<SushiStack pieceCount={100} />);
    expect(pieces()).toBe(MAX_BODIES - 51);
  });

  it('non crea pezzi finché non conosce le dimensioni del contenitore', () => {
    render(<SushiStack pieceCount={4} />);
    expect(pieces()).toBe(0);
    fireEvent(screen.getByTestId('sushi-stack'), 'layout', { nativeEvent: { layout: { width: 390, height: 780 } } });
    expect(pieces()).toBe(1);
  });
});
