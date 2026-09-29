import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { buildSavedSession, SavedSession, SessionStorageService, STORAGE_KEYS } from '../sessionStorage';
import { preferences } from '../preferences';

const session = (id: string, date: string, score = 3): SavedSession => ({
  id,
  sessionName: 'CENA',
  restaurant: '',
  date,
  players: [{ id: 'p1', name: 'Anna', score, finished: true }],
  winner: { name: 'Anna', score },
});

describe('SessionStorageService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('aggiorna una partita esistente invece di duplicarla', async () => {
    await SessionStorageService.upsertSession(session('a', '2026-01-01T20:00:00Z', 3));
    await SessionStorageService.upsertSession(session('a', '2026-01-01T20:00:00Z', 7));
    const saved = await SessionStorageService.getSavedSessions();
    expect(saved).toHaveLength(1);
    expect(saved[0].winner.score).toBe(7);
  });

  it('ordina le partite dalla più recente', async () => {
    await SessionStorageService.upsertSession(session('old', '2026-01-01T20:00:00Z'));
    await SessionStorageService.upsertSession(session('new', '2026-03-01T20:00:00Z'));
    const saved = await SessionStorageService.getSavedSessions();
    expect(saved.map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('scarta i record non validi e completa quelli delle versioni precedenti', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.savedSessions,
      JSON.stringify([
        { id: 'legacy', sessionName: 'VECCHIA', date: '01/02/2025, 21:00', players: [{ name: 'Luca', score: 5 }] },
        { foo: 'bar' },
        null,
      ])
    );
    const saved = await SessionStorageService.getSavedSessions();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: 'legacy',
      restaurant: '',
      winner: { name: 'Luca', score: 5 },
      players: [{ name: 'Luca', score: 5, finished: false }],
    });
    // Le date legacy già formattate restano leggibili
    expect(SessionStorageService.formatDate(saved[0].date)).toBe('01/02/2025, 21:00');
  });

  it('mette da parte i dati corrotti senza bloccare l’app', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.savedSessions, '{corrotto');
    await expect(SessionStorageService.getSavedSessions()).resolves.toEqual([]);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.some((k) => k.startsWith(`${STORAGE_KEYS.savedSessions}_corrupted_`))).toBe(true);
    expect(keys).not.toContain(STORAGE_KEYS.savedSessions);
  });

  it('restituisce null per una sessione attiva incompleta', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify({ sessionId: 'ABC' }));
    await expect(SessionStorageService.getActiveSession()).resolves.toBeNull();
  });

  it('calcola la durata della partita', () => {
    const from = '2026-01-01T20:00:00Z';
    expect(SessionStorageService.formatDuration(from, new Date('2026-01-01T20:45:00Z'))).toBe('45 min');
    expect(SessionStorageService.formatDuration(from, new Date('2026-01-01T22:05:00Z'))).toBe('2 h 5 min');
    expect(SessionStorageService.formatDuration('non-una-data')).toBeUndefined();
  });

  it('con keepExisting conserva il ristorante già salvato', async () => {
    await SessionStorageService.upsertSession({ ...session('a', '2026-01-01T20:00:00Z', 3), restaurant: 'Sakura' });
    await SessionStorageService.upsertSession(session('a', '2026-01-01T20:00:00Z', 5), { keepExisting: true });
    expect(await SessionStorageService.getSavedSession('a')).toMatchObject({ restaurant: 'Sakura' });
    // Senza keepExisting (ristorante cambiato dal giocatore) vale il nuovo valore
    await SessionStorageService.upsertSession(session('a', '2026-01-01T20:00:00Z', 5));
    expect(await SessionStorageService.getSavedSession('a')).toMatchObject({ restaurant: '' });
  });

  it('salvataggi contemporanei non si perdono', async () => {
    await Promise.all([
      SessionStorageService.upsertSession(session('a', '2026-01-01T20:00:00Z')),
      SessionStorageService.upsertSession(session('b', '2026-01-02T20:00:00Z')),
      SessionStorageService.upsertSession(session('c', '2026-01-03T20:00:00Z')),
    ]);
    expect((await SessionStorageService.getSavedSessions()).map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('costruisce la voce dello storico con i vincitori a pari merito', () => {
    const record = buildSavedSession({
      sessionId: 'CENA',
      sessionName: 'Cena',
      startedAt: '2026-01-01T20:00:00Z',
      restaurant: '',
      players: [
        { name: 'Anna', score: 4, finished: true },
        { name: 'Luca', score: 6, finished: true },
        { name: 'Sara', score: 6, finished: false },
      ],
    });
    expect(record.id).toBe('CENA:2026-01-01T20:00:00Z');
    expect(record.players.map((p) => p.name)).toEqual(['Luca', 'Sara', 'Anna']);
    expect(record.winner).toEqual({ name: 'Luca e Sara', score: 6 });
  });

  it('salva il token della partita nell’archivio sicuro, non in AsyncStorage', async () => {
    const active = {
      sessionId: 'CENA',
      playerId: 'p1',
      playerName: 'Anna',
      playerToken: 'segreto',
      isHost: true,
      startedAt: '2026-01-01T20:00:00Z',
      sessionStartedAt: 1234,
    };
    await SessionStorageService.saveActiveSession(active);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.activeSession)).not.toContain('segreto');
    await expect(SessionStorageService.getActiveSession()).resolves.toEqual(active);

    await SessionStorageService.clearActiveSession();
    await expect(SessionStorageService.getActiveSession()).resolves.toBeNull();
    await expect(SecureStore.getItemAsync('active_session_token')).resolves.toBeNull();
  });

  it('sposta nell’archivio sicuro il token salvato in chiaro dalle versioni precedenti', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.activeSession,
      JSON.stringify({ sessionId: 'CENA', playerId: 'p1', playerName: 'Anna', playerToken: 'vecchio', isHost: false })
    );
    await expect(SessionStorageService.getActiveSession()).resolves.toMatchObject({ playerToken: 'vecchio' });
    expect(await AsyncStorage.getItem(STORAGE_KEYS.activeSession)).not.toContain('vecchio');
    await expect(SessionStorageService.getActiveSession()).resolves.toMatchObject({ playerToken: 'vecchio' });
  });

  it('un token di un altro giocatore non viene usato', async () => {
    await SecureStore.setItemAsync('active_session_token', JSON.stringify({ playerId: 'altro', token: 'x' }));
    await AsyncStorage.setItem(
      STORAGE_KEYS.activeSession,
      JSON.stringify({ sessionId: 'CENA', playerId: 'p1', playerName: 'Anna', isHost: false })
    );
    await expect(SessionStorageService.getActiveSession()).resolves.toMatchObject({ playerToken: undefined });
  });

  it('cancellando i dati locali durante una partita questa resta riprendibile', async () => {
    await SessionStorageService.upsertSession(session('a', '2026-01-01T20:00:00Z'));
    await SessionStorageService.saveActiveSession({
      sessionId: 'CENA',
      playerId: 'p1',
      playerName: 'Anna',
      playerToken: 'tok',
      isHost: false,
      startedAt: '2026-01-01T20:00:00Z',
    });
    await preferences.clearAllLocalData({ keepActiveSession: true });
    expect(await SessionStorageService.getSavedSessions()).toEqual([]);
    await expect(SessionStorageService.getActiveSession()).resolves.toMatchObject({ playerToken: 'tok' });

    await preferences.clearAllLocalData();
    await expect(SessionStorageService.getActiveSession()).resolves.toBeNull();
  });

  it('la cancellazione dei dati locali rimuove solo le chiavi dell’app', async () => {
    await SessionStorageService.upsertSession(session('a', '2026-01-01T20:00:00Z'));
    await preferences.setPlayerName('Anna');
    await AsyncStorage.setItem('chiave_di_altra_libreria', 'x');
    await preferences.clearAllLocalData();
    expect(await AsyncStorage.getAllKeys()).toEqual(['chiave_di_altra_libreria']);
  });
});
