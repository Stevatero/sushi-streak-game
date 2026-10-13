import { MutableRefObject, useCallback, useEffect, useRef } from 'react';
import type { Player } from '../../store/gameStore';
import { SessionStorageService, buildSavedSession } from '../../services/sessionStorage';

// Dopo aver finito, lo storico si aggiorna al massimo ogni SAVE_DEBOUNCE_MS mentre gli altri mangiano
const SAVE_DEBOUNCE_MS = 1500;

interface HistoryAutosaveParams {
  sessionId: string;
  sessionName: string;
  players: Player[];
  hasFinished: boolean;
  gameEnded: boolean;
  // Chi è stato rimosso o non può rientrare non salva la partita nello storico
  excluded: boolean;
  // Inizio della partita e ristorante (ref: possono cambiare dopo il primo render)
  startedAtRef: MutableRefObject<string>;
  restaurantRef: MutableRefObject<string>;
  // true se il ristorante è stato salvato in questa schermata (anche vuoto)
  restaurantEditedRef: MutableRefObject<boolean>;
  // Salvataggio iniziale della sessione attiva: va atteso prima di scrivere lo storico
  activeSavedRef: MutableRefObject<Promise<void>>;
  onError: (message: string) => void;
}

// Salvataggio automatico nello storico quando il giocatore ha finito o la partita è chiusa: a fine
// partita subito, prima (mentre gli altri mangiano ancora) al massimo ogni SAVE_DEBOUNCE_MS. Uscendo
// dalla schermata si salva l'eventuale classifica ancora in attesa. Restituisce il salvataggio manuale.
export function useHistoryAutosave({
  sessionId,
  sessionName,
  players,
  hasFinished,
  gameEnded,
  excluded,
  startedAtRef,
  restaurantRef,
  restaurantEditedRef,
  activeSavedRef,
  onError,
}: HistoryAutosaveParams) {
  // Classifica in attesa di essere salvata nello storico (salvataggio differito)
  const pendingSaveRef = useRef<Player[] | null>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const persistResult = useCallback(
    async (list: Player[]) => {
      if (list.length === 0) return;
      // Orario di inizio e ristorante di una partita ripresa vengono prima letti dallo storage:
      // così la voce dello storico resta la stessa e non se ne crea una doppia
      await activeSavedRef.current;
      const record = buildSavedSession({
        sessionId,
        sessionName,
        startedAt: startedAtRef.current,
        restaurant: restaurantRef.current,
        players: list,
        duration: SessionStorageService.formatDuration(startedAtRef.current),
      });
      try {
        // Il ristorante già salvato resta, a meno che il giocatore non lo abbia cambiato qui
        await SessionStorageService.upsertSession(record, { keepExisting: !restaurantEditedRef.current });
      } catch {
        onErrorRef.current('Impossibile salvare la partita nello storico');
      }
    },
    [sessionId, sessionName, startedAtRef, restaurantRef, restaurantEditedRef, activeSavedRef]
  );

  const persistResultRef = useRef(persistResult);
  useEffect(() => {
    persistResultRef.current = persistResult;
  }, [persistResult]);

  useEffect(() => {
    if (excluded || !(hasFinished || gameEnded)) {
      pendingSaveRef.current = null;
      return;
    }
    if (gameEnded) {
      pendingSaveRef.current = null;
      persistResult(players);
      return;
    }
    pendingSaveRef.current = players;
    const timer = setTimeout(() => {
      pendingSaveRef.current = null;
      persistResult(players);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [players, hasFinished, gameEnded, excluded, persistResult]);

  useEffect(
    () => () => {
      const pending = pendingSaveRef.current;
      if (pending) persistResultRef.current(pending);
    },
    []
  );

  return persistResult;
}
