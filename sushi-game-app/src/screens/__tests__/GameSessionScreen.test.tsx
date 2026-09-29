/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
// Ultimo listener "beforeRemove" registrato dalla schermata (uscita con conferma)
let mockBeforeRemove: ((event: unknown) => void) | undefined;
const mockDispatch = jest.fn();
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
    addListener: (_event: string, listener: (event: unknown) => void) => {
      mockBeforeRemove = listener;
      return () => undefined;
    },
    popTo: jest.fn(),
    dispatch: mockDispatch,
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
      kickPlayer: jest.fn(() => Promise.resolve({ ok: true })),
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
    await renderWithProviders(<GameSessionScreen />);
    expect(socketService.joinSession).toHaveBeenCalledWith({ sessionId: 'CENA', playerId: 'p1', token: 'tok' });
    await waitFor(async () =>
      expect(await SessionStorageService.getActiveSession()).toMatchObject({ sessionId: 'CENA', playerToken: 'tok' })
    );
  });

  it('mostra la classifica con la posizione del giocatore e registra i pezzi', async () => {
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());
    serverEmit('connection', 'connected');

    expect(screen.getByText('Sei 2° su 2 · 3 pezzi')).toBeTruthy();
    expect(screen.getByText(/Anna.*\(tu\)/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Aggiungi pezzo'));
    await waitFor(() => expect(socketService.addPiece).toHaveBeenCalledTimes(1));
  });

  it('offline non invia pezzi e avvisa il giocatore', async () => {
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());
    serverEmit('connection', 'connecting');

    expect(screen.getByText(/Riconnessione in corso/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Aggiungi pezzo'));
    expect(socketService.addPiece).not.toHaveBeenCalled();
    expect(await screen.findByText(/Sei offline/)).toBeTruthy();
  });

  it('annulla l’ultimo pezzo con il suono "bop"', async () => {
    const SoundManager = require('../../utils/SoundManager').default;
    const bop = jest.spyOn(SoundManager, 'playUndoSound');
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());

    fireEvent.press(screen.getByLabelText('Annulla ultimo'));
    await waitFor(() => expect(socketService.removePiece).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Ultimo pezzo annullato')).toBeTruthy();
    expect(bop).toHaveBeenCalledTimes(1);
  });

  it('chiede conferma prima di segnare la fine e poi blocca l’aggiunta di pezzi', async () => {
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());

    fireEvent.press(screen.getByLabelText('Ho finito!'));
    expect(screen.getByText('Hai finito di mangiare?')).toBeTruthy();
    expect(screen.getByText('pezzi mangiati')).toBeTruthy();
    expect(socketService.finishGame).not.toHaveBeenCalled();

    // "Mangio ancora" chiude la conferma senza segnare la fine
    fireEvent.press(screen.getByText('Mangio ancora'));
    expect(socketService.finishGame).not.toHaveBeenCalled();

    // La conferma si riapre al termine della dissolvenza di chiusura
    fireEvent.press(screen.getByLabelText('Ho finito!'));
    const confirm = await screen.findByText('Sì, ho finito!');
    await act(async () => {
      fireEvent.press(confirm);
    });

    expect(socketService.finishGame).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/In attesa degli altri giocatori/)).toBeTruthy();
    expect(screen.queryByLabelText('Aggiungi pezzo')).toBeNull();
  });

  it('a fine partita salva automaticamente il risultato nello storico', async () => {
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('gameEnded', snapshot('ended', true));

    await waitFor(async () => {
      const saved = await SessionStorageService.getSavedSessions();
      expect(saved).toHaveLength(1);
      expect(saved[0].winner).toEqual({ name: 'Luca', score: 5 });
    });
    await waitFor(async () => expect(await SessionStorageService.getActiveSession()).toBeNull());
  });

  it('in caso di pareggio proclama tutti i vincitori e li salva nello storico', async () => {
    await renderWithProviders(<GameSessionScreen />);
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

  it("l'host può rimuovere un altro giocatore dopo una conferma", async () => {
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', { ...snapshot(), hostId: 'p1' });

    expect(screen.getByText(/tocca un giocatore per rimuoverlo/)).toBeTruthy();
    fireEvent.press(screen.getByText('Luca'));
    expect(screen.getByText('Rimuovere Luca?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Rimuovi'));
    });
    expect(socketService.kickPlayer).toHaveBeenCalledWith('p2');
    expect(await screen.findByText('Luca è stato rimosso')).toBeTruthy();
  });

  it('chi non è host non può rimuovere nessuno', async () => {
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', { ...snapshot(), hostId: 'p2' });

    expect(screen.queryByText(/tocca un giocatore per rimuoverlo/)).toBeNull();
    fireEvent.press(screen.getByText('Luca'));
    expect(screen.queryByText(/Rimuovere/)).toBeNull();
  });

  it('chiede conferma prima di uscire dalla partita', async () => {
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());

    const action = { type: 'GO_BACK' };
    const preventDefault = jest.fn();
    act(() => mockBeforeRemove!({ preventDefault, data: { action } }));
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByText('Uscire dalla partita?')).toBeTruthy();

    fireEvent.press(screen.getByText('Esci dalla partita'));
    // L'uscita avviene dopo la chiusura della finestra
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(action));
  });

  it('riprendendo la partita il ristorante già indicato non viene cancellato', async () => {
    const startedAt = '2026-01-01T20:00:00.000Z';
    await SessionStorageService.saveActiveSession({
      sessionId: 'CENA',
      sessionName: 'Cena',
      playerId: 'p1',
      playerName: 'Anna',
      playerToken: 'tok',
      isHost: true,
      startedAt,
    });
    await SessionStorageService.upsertSession({
      id: `CENA:${startedAt}`,
      sessionName: 'Cena',
      restaurant: 'Sakura',
      date: startedAt,
      players: [{ id: 'p1', name: 'Anna', score: 3, finished: true }],
      winner: { name: 'Anna', score: 3 },
    });

    await renderWithProviders(<GameSessionScreen />);
    serverEmit('gameEnded', snapshot('ended', true));

    await waitFor(async () => {
      const saved = await SessionStorageService.getSavedSessions();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ id: `CENA:${startedAt}`, restaurant: 'Sakura' });
      expect(saved[0].winner).toEqual({ name: 'Luca', score: 5 });
    });
  });

  it('avvisa se un pezzo non viene contato perché si tocca troppo in fretta', async () => {
    (socketService.addPiece as jest.Mock).mockResolvedValueOnce({ ok: false, code: 'rate_limited' });
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', snapshot());

    fireEvent.press(screen.getByLabelText('Aggiungi pezzo'));
    expect(await screen.findByText('Troppo veloce: pezzo non contato')).toBeTruthy();
  });

  it('se si viene rimossi avvisa e non salva la partita nello storico', async () => {
    await renderWithProviders(<GameSessionScreen />);
    serverEmit('session', { ...snapshot(), hostId: 'p2' });
    serverEmit('kicked', { sessionId: 'CENA' });

    expect(screen.getByText('Sei stato rimosso dalla partita')).toBeTruthy();
    expect(screen.getByText('Torna alla Home')).toBeTruthy();
    await waitFor(async () => expect(await SessionStorageService.getActiveSession()).toBeNull());
    expect(await SessionStorageService.getSavedSessions()).toHaveLength(0);
  });
});
