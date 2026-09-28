import { useCallback, useEffect, useRef, useState } from 'react';
import { SHEET_CLOSE_MS } from '../components/ui/Sheet';

type Timer = ReturnType<typeof setTimeout>;

// Una sola finestra modale alla volta per schermata. Su iOS una Modal non si apre mentre un'altra si sta
// chiudendo (e una schermata non va chiusa sotto una Modal in dissolvenza): il passaggio da una finestra
// all'altra, e le azioni che seguono una chiusura, attendono la fine della dissolvenza.
export function useExclusiveModal<T extends string>() {
  const [modal, setModal] = useState<T | null>(null);
  const currentRef = useRef<T | null>(null);
  const closedAtRef = useRef(0);
  const pendingRef = useRef<Timer | null>(null);
  const [timers] = useState(() => new Set<Timer>());

  const apply = useCallback((next: T | null) => {
    if (currentRef.current !== null && next !== currentRef.current) closedAtRef.current = Date.now();
    currentRef.current = next;
    setModal(next);
  }, []);

  const schedule = useCallback(
    (fn: () => void) => {
      const wait = closedAtRef.current + SHEET_CLOSE_MS - Date.now();
      if (wait <= 0) {
        fn();
        return null;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, wait);
      timers.add(timer);
      return timer;
    },
    [timers]
  );

  const cancelPending = useCallback(() => {
    if (!pendingRef.current) return;
    clearTimeout(pendingRef.current);
    timers.delete(pendingRef.current);
    pendingRef.current = null;
  }, [timers]);

  const openModal = useCallback(
    (next: T) => {
      cancelPending();
      if (currentRef.current === next) return;
      if (currentRef.current !== null) apply(null);
      pendingRef.current = schedule(() => {
        pendingRef.current = null;
        apply(next);
      });
    },
    [apply, cancelPending, schedule]
  );

  const closeModal = useCallback(() => {
    cancelPending();
    if (currentRef.current !== null) apply(null);
  }, [apply, cancelPending]);

  // Esegue fn appena l'ultima finestra chiusa è sparita (es. per cambiare schermata)
  const afterModalClose = useCallback((fn: () => void) => void schedule(fn), [schedule]);

  useEffect(() => () => timers.forEach(clearTimeout), [timers]);

  return { modal, openModal, closeModal, afterModalClose };
}
