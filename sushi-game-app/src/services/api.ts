import { API_URL, REQUEST_TIMEOUT_MS } from '../config';

export interface PublicPlayer {
  name: string;
  score: number;
  finished: boolean;
}

export type SessionStatus = 'active' | 'ended' | 'expired';

export interface SessionInfo {
  sessionId: string;
  sessionName: string;
  playersCount: number;
  isActive: boolean;
  status: SessionStatus;
  // Inizio della partita (server 1.7+): cambia se il codice viene riutilizzato per una nuova partita
  startedAt?: number;
  expiresAt: number;
  players: PublicPlayer[];
}

export interface SessionCredentials {
  sessionId: string;
  sessionName: string;
  playerId: string;
  playerToken: string;
  startedAt?: number;
  expiresAt: number;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'Il server non risponde. Controlla la connessione e riprova.'
        : 'Impossibile connettersi al server. Controlla la connessione e riprova.',
      0,
      aborted ? 'timeout' : 'network'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('Il server ha restituito una risposta non valida.', response.status, 'invalid_response');
  }

  if (!response.ok) {
    throw new ApiError(data?.error || 'Si è verificato un errore', response.status, data?.code);
  }
  return data as T;
}

export const api = {
  createSession(sessionName: string, playerName: string) {
    return request<SessionCredentials>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ sessionName, playerName }),
    });
  },

  joinSession(sessionId: string, playerName: string) {
    return request<SessionCredentials>('/api/sessions/join', {
      method: 'POST',
      body: JSON.stringify({ sessionId, playerName }),
    });
  },

  getSessionInfo(sessionId: string) {
    return request<SessionInfo>(`/api/sessions/${encodeURIComponent(sessionId)}/info`);
  },
};
