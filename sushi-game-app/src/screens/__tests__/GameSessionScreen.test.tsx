/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test/renderWithProviders';
import GameSessionScreen from '../GameSessionScreen';
import socketService from '../../services/socketService';
import { SessionStorageService } from '../../services/sessionStorage';
import useGameStore from '../../store/gameStore';

type Listener = (payload: any) => void;

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../components/SushiStack', () => () => null);
jest.mock('../../components/SakuraCelebration', () => () => null);
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({
    params: {
      sessionId: 'CENA',
      sessionName: 'Cena',
      playerId: 'p1',
      playerName: 'Anna',
      playerToken: 'tok',
      isHost: true,
    },
  }),
  useNavigation: () => ({
    addListener: () => () => undefined,
    popTo: jest.fn(),
    dispatch: jest.fn(),
    navigate: jest.fn(),
  }),
}));
jest.mock('../../services/socketService', () => {
  const listeners = new Map<string, Listener[]>();
  return {
    __esModule: true,
    listeners,
    default: {
      on: jest.fn((event: string, listener: Listener) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return () => undefined;
      }),
      joinSession: jest.fn(),
      leaveSession: jest.fn(),
      getStatus: jest.fn(() => 'connected'),
      addPiece: jest.fn(() => Promise.resolve({ ok: true, score: 1 })),
      removePiece: jest.fn(() => Promise.resolve({ ok: true, score: 0 })),
      finishGame: jest.fn(() => Promise.resolve({ ok: true })),
    },
  };
});

const { listeners } = jest.requireMock('../../services/socketService') as { listeners: Map<string, Listener[]> };
const serverEmit = (event: string, payload: unknown) =>
  act(() => {
    listeners.get(event)?.forEach((l) => l(payload));
  });

const snapshot = (status = 'active', finished = false) => ({
  id: 'CENA',
  name: 'Cena',
  status,
  expiresAt: Date.now() + 60000,
  players: [
    { id: 'p1', name: 'Anna', score: 3, finished },
    { id: 'p2', name: 'Luca', score: 5, finished: true },
  ],
});

describe('GameSessionScreen', () => {
  // La FlatList pianifica render differiti: li si completa dentro act prima dello smontaggio
  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useGameStore.setState({ connection: 'connected' });
  });

  it('si collega alla partita e salva la sessione attiva per la ripresa', async () => {
    renderWithProviders(<GameSessionScreen />);
    expect(socketService.joinSession).toHaveBeenCalledWith({ sessionId: 'CENA', playerId: 'p1', token: 'tok' });
    await waitFor(async () =>
      expect(await SessionStorageService.getActiveSession()).toMatchObject({ sessionId: 'CENA', playerToken: 'tok' })
    );
  });

  it('mostra la classifica con la posizione del giocatore e registra i pezzi', async () => {
    renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());
    serverEmit('connection', 'connected');

    expect(screen.getByText('Sei 2° su 2 · 3 pezzi')).toBeTruthy();
    expect(screen.getByText(/Anna.*\(tu\)/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Aggiungi pezzo'));
    await waitFor(() => expect(socketService.addPiece).toHaveBeenCalledTimes(1));
  });

  it('offline non invia pezzi e avvisa il giocatore', async () => {
    renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());
    serverEmit('connection', 'connecting');

    expect(screen.getByText(/Riconnessione in corso/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Aggiungi pezzo'));
    expect(socketService.addPiece).not.toHaveBeenCalled();
    expect(await screen.findByText(/Sei offline/)).toBeTruthy();
  });

  it('chiede conferma prima di segnare la fine e poi blocca l’aggiunta di pezzi', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());

    fireEvent.press(screen.getByLabelText('Ho finito!'));
    expect(socketService.finishGame).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2]!;
    await act(async () => {
      await buttons.find((b) => b.text === 'Ho finito!')!.onPress!();
    });

    expect(socketService.finishGame).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/In attesa degli altri giocatori/)).toBeTruthy();
    expect(screen.queryByLabelText('Aggiungi pezzo')).toBeNull();
  });

  it('a fine partita salva automaticamente il risultato nello storico', async () => {
    renderWithProviders(<GameSessionScreen />);
    serverEmit('gameEnded', snapshot('ended', true));

    await waitFor(async () => {
      const saved = await SessionStorageService.getSavedSessions();
      expect(saved).toHaveLength(1);
      expect(saved[0].winner).toEqual({ name: 'Luca', score: 5 });
    });
    await waitFor(async () => expect(await SessionStorageService.getActiveSession()).toBeNull());
  });

  it('in caso di pareggio proclama tutti i vincitori e li salva nello storico', async () => {
    renderWithProviders(<GameSessionScreen />);
    serverEmit('gameEnded', {
      ...snapshot('ended', true),
      players: [
        { id: 'p1', name: 'Anna', score: 5, finished: true },
        { id: 'p2', name: 'Luca', score: 5, finished: true },
      ],
    });

    expect(screen.getAllByText('Pareggio tra Anna e Luca con 5 pezzi!').length).toBeGreaterThan(0);
    await waitFor(async () => {
      const [saved] = await SessionStorageService.getSavedSessions();
      expect(saved.winner).toEqual({ name: 'Anna e Luca', score: 5 });
    });
  });
});
