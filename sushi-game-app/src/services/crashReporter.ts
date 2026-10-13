// Segnalazione degli errori al nostro server (nessuna terza parte), solo se l'utente l'ha attivata da
// Impostazioni → Privacy: è disattivata di default. Si inviano versione dell'app, sistema operativo ed
// errore (nome, messaggio, stack), mai nomi, punteggi o codici delle partite. Un errore che chiude l'app
// viene salvato sul telefono e inviato all'avvio successivo.
import { Platform } from 'react-native';
import { API_URL, APP_VERSION } from '../config';
import { setErrorReporter, ErrorReporter } from '../utils/logger';
import { preferences } from './preferences';

export interface CrashReport {
  appVersion: string;
  platform: string;
  osVersion: string;
  name: string;
  message: string;
  stack?: string;
  context?: string;
  fatal: boolean;
}

// Al massimo qualche segnalazione per avvio, ognuna una sola volta
const MAX_REPORTS_PER_RUN = 10;
const MAX_STACK_LENGTH = 4000;
const SEND_TIMEOUT_MS = 10000;
// Attesa massima per salvare un errore fatale prima di lasciar chiudere l'app
const FATAL_SAVE_TIMEOUT_MS = 500;

let enabled = false;
let sentThisRun = 0;
const alreadySent = new Set<string>();
let handlerInstalled = false;

export function buildCrashReport(error: unknown, fatal: boolean, context?: string): CrashReport {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Errore sconosciuto');
  return {
    appVersion: APP_VERSION,
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    name: (err.name || 'Error').slice(0, 120),
    message: (err.message || '').slice(0, 1000),
    stack: err.stack?.slice(0, MAX_STACK_LENGTH),
    context: context?.slice(0, 300),
    fatal,
  };
}

// true se la segnalazione è arrivata o se riprovare è inutile (richiesta rifiutata dal server)
async function send(report: CrashReport): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/crash-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Version': APP_VERSION },
      body: JSON.stringify(report),
      signal: controller.signal,
    });
    return response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429);
  } catch {
    // Offline o server non raggiungibile: nessun log, per non generare altre segnalazioni
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function report(error: unknown, fatal: boolean, context?: string) {
  if (!enabled || sentThisRun >= MAX_REPORTS_PER_RUN) return;
  const crash = buildCrashReport(error, fatal, context);
  const key = `${crash.name}:${crash.message}`;
  if (alreadySent.has(key)) return;
  alreadySent.add(key);
  sentThisRun += 1;
  void send(crash);
}

// Collegato a logger.error: ogni errore registrato dall'app diventa una segnalazione
const reporter: ErrorReporter = (error, context) => {
  const message = typeof context?.message === 'string' ? context.message : undefined;
  report(error, false, message);
};

// Errori JavaScript non intercettati. Quelli fatali chiudono l'app: la segnalazione viene salvata e
// inviata al prossimo avvio
function installGlobalHandler() {
  if (handlerInstalled || typeof ErrorUtils === 'undefined') return;
  handlerInstalled = true;
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (!enabled) {
      previous(error, isFatal);
      return;
    }
    if (!isFatal) {
      report(error, false, 'Errore non gestito');
      previous(error, isFatal);
      return;
    }
    const saved = preferences.setPendingCrashReport(JSON.stringify(buildCrashReport(error, true, 'Errore fatale')));
    const timeout = new Promise((resolve) => setTimeout(resolve, FATAL_SAVE_TIMEOUT_MS));
    Promise.race([saved, timeout]).finally(() => previous(error, isFatal));
  });
}

function isCrashReport(value: unknown): value is CrashReport {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.name === 'string' && typeof r.message === 'string' && typeof r.appVersion === 'string';
}

// All'avvio: gestore degli errori, consenso salvato e invio dell'eventuale errore fatale precedente
export async function initCrashReporting() {
  installGlobalHandler();
  enabled = await preferences.getCrashReportsEnabled();
  setErrorReporter(enabled ? reporter : null);

  const pending = await preferences.getPendingCrashReport();
  if (!pending) return;
  if (!enabled) {
    await preferences.clearPendingCrashReport();
    return;
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(pending);
  } catch {
    // Segnalazione illeggibile: viene scartata
  }
  // Se l'invio non riesce (es. offline) si riprova al prossimo avvio
  if (!isCrashReport(parsed) || (await send(parsed))) await preferences.clearPendingCrashReport();
}

export function isCrashReportingEnabled() {
  return enabled;
}

export function setCrashReportingEnabled(value: boolean) {
  enabled = value;
  preferences.setCrashReportsEnabled(value);
  setErrorReporter(value ? reporter : null);
  if (!value) preferences.clearPendingCrashReport();
}
