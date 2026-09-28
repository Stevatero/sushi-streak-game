import AsyncStorage from '@react-native-async-storage/async-storage';
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
}

export const STORAGE_KEYS = {
  savedSessions: 'saved_sessions',
  activeSession: 'active_session',
} as const;

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

export class SessionStorageService {
  // Inserisce o aggiorna una partita salvata (stesso id = stessa partita, niente duplicati)
  static async upsertSession(session: SavedSession): Promise<void> {
    try {
      const existing = await this.getSavedSessions();
      const others = existing.filter((s) => s.id !== session.id);
      const updated = sortByDateDesc([session, ...others]).slice(0, MAX_SAVED_SESSIONS);
      await AsyncStorage.setItem(STORAGE_KEYS.savedSessions, JSON.stringify(updated));
    } catch (error) {
      logger.error('Salvataggio partita non riuscito', error);
      throw new Error('Impossibile salvare la sessione');
    }
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

  static async deleteSession(sessionId: string): Promise<void> {
    try {
      const existingSessions = await this.getSavedSessions();
      const filteredSessions = existingSessions.filter((session) => session.id !== sessionId);
      await AsyncStorage.setItem(STORAGE_KEYS.savedSessions, JSON.stringify(filteredSessions));
    } catch (error) {
      logger.error('Eliminazione partita non riuscita', error);
      throw new Error('Impossibile eliminare la sessione');
    }
  }

  static async clearAllSessions(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.savedSessions);
    } catch (error) {
      logger.error('Pulizia storico non riuscita', error);
      throw new Error('Impossibile eliminare tutte le sessioni');
    }
  }

  static async saveActiveSession(session: ActiveSession): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(session));
    } catch (error) {
      logger.warn('Salvataggio sessione attiva non riuscito', error);
    }
  }

  static async getActiveSession(): Promise<ActiveSession | null> {
    try {
      return toActiveSession(await readJson(STORAGE_KEYS.activeSession));
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
