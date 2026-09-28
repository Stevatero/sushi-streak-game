/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test/renderWithProviders';
import HomeScreen from '../HomeScreen';
import * as Clipboard from 'expo-clipboard';
import { api, ApiError } from '../../services/api';

const mockNavigate = jest.fn();

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // In test la schermata è sempre "a fuoco": l'effetto viene eseguito una volta
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => effect(), [effect]);
  },
}));
jest.mock('../../services/api', () => {
  const actual = jest.requireActual('../../services/api');
  return { ...actual, api: { createSession: jest.fn(), joinSession: jest.fn(), getSessionInfo: jest.fn() } };
});

// Attende il completamento dei caricamenti asincroni iniziali (nome salvato, sessione attiva)
const renderHome = async () => {
  renderWithProviders(<HomeScreen />);
  await act(async () => {});
};

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea una sessione e apre la partita con le credenziali ricevute', async () => {
    (api.createSession as jest.Mock).mockResolvedValue({
      sessionId: 'CENA-1',
      sessionName: 'CENA-1',
      playerId: 'p1',
      playerToken: 'tok',
      expiresAt: 0,
    });
    await renderHome();

    // La scheda "Crea" è aperta di default
    fireEvent.changeText(screen.getByLabelText('Codice della sessione'), 'cena 1');
    fireEvent.changeText(screen.getByLabelText('Il tuo nome'), '  Anna  ');
    fireEvent.press(screen.getByText('Crea partita'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(api.createSession).toHaveBeenCalledWith('CENA-1', 'Anna');
    expect(mockNavigate).toHaveBeenCalledWith('GameSession', {
      sessionId: 'CENA-1',
      sessionName: 'CENA-1',
      playerId: 'p1',
      playerName: 'Anna',
      playerToken: 'tok',
      isHost: true,
    });
  });

  it('un doppio tocco su "Crea partita" invia una sola richiesta', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    (api.createSession as jest.Mock).mockReturnValue(new Promise((r) => (resolve = r)));
    await renderHome();

    fireEvent.changeText(screen.getByLabelText('Il tuo nome'), 'Anna');
    const button = screen.getByRole('button', { name: 'Crea partita' });
    // Due tocchi prima che React aggiorni lo stato "loading"
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    await act(async () => {
      resolve({ sessionId: 'X1Y2Z3', sessionName: 'X1Y2Z3', playerId: 'p1', playerToken: 'tok', expiresAt: 0 });
    });

    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('incolla il codice da un link di invito copiato', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('Unisciti! https://sushi.dietalab.net/join/CENA-42');
    await renderHome();
    fireEvent.press(screen.getByText('Partecipa'));
    await act(async () => {
      fireEvent.press(screen.getByText('Incolla'));
    });
    expect(screen.getByLabelText('Codice della sessione').props.value).toBe('CENA-42');
  });

  it('non invia la richiesta di join con un codice non valido', async () => {
    await renderHome();
    fireEvent.press(screen.getByText('Partecipa'));
    fireEvent.changeText(screen.getByLabelText('Codice della sessione'), 'ab');
    fireEvent.changeText(screen.getByLabelText('Il tuo nome'), 'Anna');
    fireEvent.press(screen.getByText('Entra in partita'));
    expect(api.joinSession).not.toHaveBeenCalled();
  });

  it('mostra l’errore del server e offre il riprova solo per errori di rete', async () => {
    (api.joinSession as jest.Mock)
      .mockRejectedValueOnce(new ApiError('Nome già in uso in questa sessione', 409, 'name_taken'))
      .mockRejectedValueOnce(new ApiError('Impossibile connettersi al server.', 0, 'network'));
    await renderHome();

    fireEvent.press(screen.getByText('Partecipa'));
    fireEvent.changeText(screen.getByLabelText('Codice della sessione'), 'cena');
    fireEvent.changeText(screen.getByLabelText('Il tuo nome'), 'Anna');
    fireEvent.press(screen.getByText('Entra in partita'));

    expect(await screen.findByText('Nome già in uso in questa sessione')).toBeTruthy();
    expect(screen.queryByText(/Riprova/)).toBeNull();

    fireEvent.press(screen.getByText('Entra in partita'));
    expect(await screen.findByText('Impossibile connettersi al server.')).toBeTruthy();
    expect(screen.getByText(/Riprova/)).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
