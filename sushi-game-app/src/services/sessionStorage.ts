import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';

export interface SavedPlayer {
  id: string;
  name: string;
  score: number;
  finished: boolean;
}

export interface SavedSession {
  id: string;
  sessionName: string;
  restaurant: string;
  // Data in formato ISO 8601 (le versioni precedenti salvavano una stringa già formattata)
  date: string;
  players: SavedPlayer[];
  winner: {
    name: string;
    score: number;
  };
  duration?: string;
}

export interface ActiveSession {
  sessionId: string;
  sessionName?: string;
  playerId: string;
  playerName: string;
  playerToken?: string;
  isHost: boolean;
  startedAt: string;
  // Inizio della partita secondo il server: distingue partite diverse con lo stesso codice
  sessionStartedAt?: number;
}

export const STORAGE_KEYS = {
  savedSessions: 'saved_sessions',
  activeSession: 'active_session',
} as const;

// Il token della partita in corso sta nell'archivio sicuro del sistema (Android Keystore, Portachiavi iOS)
const SECURE_TOKEN_KEY = 'active_session_token';

const MAX_SAVED_SESSIONS = 200;

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

// Converte un record letto dallo storage in un SavedSession valido, oppure null se inutilizzabile
function toSavedSession(value: unknown): SavedSession | null {
  if (!isObject(value) || !isString(value.id) || !isString(value.date) || !Array.isArray(value.players)) return null;
  const players: SavedPlayer[] = value.players
    .filter((p): p is Record<string, unknown> => isObject(p) && isString(p.name))
    .map((p, index) => ({
      id: isString(p.id) ? p.id : `player-${index}`,
      name: p.name as string,
      score: isNumber(p.score) ? p.score : 0,
      finished: p.finished === true,
    }));
  const winner = isObject(value.winner) ? value.winner : {};
  return {
    id: value.id,
    sessionName: isString(value.sessionName) ? value.sessionName : '—',
    restaurant: isString(value.restaurant) ? value.restaurant : '',
    date: value.date,
    players,
    winner: {
      name: isString(winner.name) ? winner.name : (players[0]?.name ?? 'Nessuno'),
      score: isNumber(winner.score) ? winner.score : (players[0]?.score ?? 0),
    },
    duration: isString(value.duration) ? value.duration : undefined,
  };
}

function toActiveSession(value: unknown): ActiveSession | null {
  if (!isObject(value) || !isString(value.sessionId) || !isString(value.playerId) || !isString(value.playerName)) {
    return null;
  }
  return {
    sessionId: value.sessionId,
    sessionName: isString(value.sessionName) ? value.sessionName : undefined,
    playerId: value.playerId,
    playerName: value.playerName,
    playerToken: isString(value.playerToken) ? value.playerToken : undefined,
    isHost: value.isHost === true,
    startedAt: isString(value.startedAt) ? value.startedAt : new Date().toISOString(),
    sessionStartedAt: isNumber(value.sessionStartedAt) ? value.sessionStartedAt : undefined,
  };
}

// Token salvato insieme all'id del giocatore, così non viene mai associato alla partita sbagliata
async function readSecureToken(playerId: string): Promise<string | undefined> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) && parsed.playerId === playerId && isString(parsed.token) ? parsed.token : undefined;
  } catch (error) {
    logger.warn('Lettura del token non riuscita', error);
    return undefined;
  }
}

async function writeSecureToken(playerId: string, token: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(SECURE_TOKEN_KEY, JSON.stringify({ playerId, token }));
    return true;
  } catch (error) {
    logger.warn("Salvataggio del token nell'archivio sicuro non riuscito", error);
    return false;
  }
}

async function deleteSecureToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  } catch (error) {
    logger.warn('Cancellazione del token non riuscita', error);
  }
}

export interface ResultPlayer {
  id?: string;
  name: string;
  score: number;
  finished: boolean;
}

// Costruisce la voce dello storico di una partita (classifica ordinata, vincitori a pari merito)
export function buildSavedSession(params: {
  sessionId: string;
  sessionName: string;
  startedAt: string;
  restaurant: string;
  players: ResultPlayer[];
  duration?: string;
}): SavedSession {
  const sorted = [...params.players]
    .sort((a, b) => b.score - a.score)
    .map((p, index) => ({ id: p.id ?? `player-${index}`, name: p.name, score: p.score, finished: p.finished }));
  const best = sorted[0]?.score ?? 0;
  const tied = sorted.filter((p) => p.score === best);
  return {
    id: `${params.sessionId}:${params.startedAt}`,
    sessionName: params.sessionName,
    restaurant: params.restaurant,
    date: params.startedAt,
    players: sorted,
    winner: {
      name: best > 0 ? tied.map((p) => p.name).join(' e ') : 'Nessuno',
      score: best,
    },
    duration: params.duration,
  };
}

// Solo le date ISO 8601 vengono interpretate: le stringhe legacy ("01/02/2025, 21:00", formato italiano)
// verrebbero altrimenti lette da Date come mese/giorno all'americana.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;

function parseIsoDate(value: string): number | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function sortByDateDesc(sessions: SavedSession[]) {
  const time = (s: SavedSession) => parseIsoDate(s.date) ?? 0;
  return [...sessions].sort((a, b) => time(b) - time(a));
}

// Legge e fa il parse di una chiave JSON; i dati illeggibili vengono spostati da parte, non persi
async function readJson(key: string): Promise<unknown> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    logger.warn(`Dati corrotti nella chiave ${key}, spostati in backup`, error);
    await AsyncStorage.setItem(`${key}_corrupted_${Date.now()}`, raw);
    await AsyncStorage.removeItem(key);
    return null;
  }
}

// Le modifiche allo storico (lettura, modifica, scrittura) vengono eseguite una alla volta: due
// salvataggi ravvicinati non si sovrascrivono a vicenda
let historyQueue: Promise<unknown> = Promise.resolve();
function queueHistoryWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = historyQueue.then(task);
  historyQueue = run.catch(() => undefined);
  return run;
}

export class SessionStorageService {
  // Inserisce o aggiorna una partita salvata (stesso id = stessa partita, niente duplicati).
  // Con keepExisting il ristorante e la durata già salvati restano se la nuova voce non li indica.
  static upsertSession(session: SavedSession, options: { keepExisting?: boolean } = {}): Promise<void> {
    return queueHistoryWrite(async () => {
      try {
        const existing = await this.getSavedSessions();
        const previous = existing.find((s) => s.id === session.id);
        const record =
          options.keepExisting && previous
            ? {
                ...session,
                restaurant: session.restaurant || previous.restaurant,
                duration: session.duration ?? previous.duration,
              }
            : session;
        const others = existing.filter((s) => s.id !== session.id);
        const updated = sortByDateDesc([record, ...others]).slice(0, MAX_SAVED_SESSIONS);
        await AsyncStorage.setItem(STORAGE_KEYS.savedSessions, JSON.stringify(updated));
      } catch (error) {
        logger.error('Salvataggio partita non riuscito', error);
        throw new Error('Impossibile salvare la sessione');
      }
    });
  }

  static async getSavedSession(id: string): Promise<SavedSession | null> {
    return (await this.getSavedSessions()).find((s) => s.id === id) ?? null;
  }

  static async getSavedSessions(): Promise<SavedSession[]> {
    try {
      const data = await readJson(STORAGE_KEYS.savedSessions);
      if (!Array.isArray(data)) return [];
      return sortByDateDesc(data.map(toSavedSession).filter((s): s is SavedSession => s !== null));
    } catch (error) {
      logger.error('Lettura storico non riuscita', error);
      return [];
    }
  }

  static deleteSession(sessionId: string): Promise<void> {
    return queueHistoryWrite(async () => {
      try {
        const existingSessions = await this.getSavedSessions();
        const filteredSessions = existingSessions.filter((session) => session.id !== sessionId);
        await AsyncStorage.setItem(STORAGE_KEYS.savedSessions, JSON.stringify(filteredSessions));
      } catch (error) {
        logger.error('Eliminazione partita non riuscita', error);
        throw new Error('Impossibile eliminare la sessione');
      }
    });
  }

  static async clearAllSessions(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.savedSessions);
    } catch (error) {
      logger.error('Pulizia storico non riuscita', error);
      throw new Error('Impossibile eliminare tutte le sessioni');
    }
  }

  // Il token va nell'archivio sicuro; solo se questo non è disponibile resta in AsyncStorage
  static async saveActiveSession(session: ActiveSession): Promise<void> {
    try {
      const { playerToken, ...rest } = session;
      const secured = playerToken ? await writeSecureToken(session.playerId, playerToken) : false;
      const record = secured || !playerToken ? rest : session;
      await AsyncStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(record));
    } catch (error) {
      logger.warn('Salvataggio sessione attiva non riuscito', error);
    }
  }

  static async getActiveSession(): Promise<ActiveSession | null> {
    try {
      const session = toActiveSession(await readJson(STORAGE_KEYS.activeSession));
      if (!session) return null;
      // Le versioni precedenti salvavano il token in chiaro: lo si sposta nell'archivio sicuro
      if (session.playerToken) {
        if (await writeSecureToken(session.playerId, session.playerToken)) {
          const { playerToken, ...rest } = session;
          await AsyncStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(rest));
          return { ...rest, playerToken };
        }
        return session;
      }
      return { ...session, playerToken: await readSecureToken(session.playerId) };
    } catch (error) {
      logger.warn('Lettura sessione attiva non riuscita', error);
      return null;
    }
  }

  static async clearActiveSession(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.activeSession);
    } catch (error) {
      logger.warn('Pulizia sessione attiva non riuscita', error);
    }
    await deleteSecureToken();
  }

  // Data di una partita salvata, se in formato ISO (null per le date legacy già formattate)
  static parseDate(value: string): Date | null {
    const time = parseIsoDate(value);
    return time == null ? null : new Date(time);
  }

  // Formatta una data ISO per la visualizzazione; le date legacy già formattate restano invariate
  static formatDate(value: string | Date): string {
    const time = value instanceof Date ? value.getTime() : parseIsoDate(value);
    if (time == null || Number.isNaN(time)) return String(value);
    const date = new Date(time);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  static formatDuration(fromIso: string, to: Date = new Date()): string | undefined {
    const from = parseIsoDate(fromIso);
    if (from == null) return undefined;
    const minutes = Math.max(0, Math.round((to.getTime() - from) / 60000));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }
}
