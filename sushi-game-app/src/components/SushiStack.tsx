import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FrameInfo,
  SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import {
  advanceWorld,
  B_ANGLE,
  B_X,
  B_Y,
  bodyOffset,
  createWorld,
  isIdle,
  MAX_BODIES,
  removeBody,
  setWorldBounds,
  spawnBody,
  SpawnParams,
  wakeWorld,
  worldSeq,
} from './sushiStack/physics';
import { createPieceShape, createSpawnParams, PieceShape, SUSHI_KINDS } from './sushiStack/pieces';

/**
 * Pila di sushi con fisica: ogni pezzo del punteggio cade dall'alto e si accumula sul fondo.
 *
 * La simulazione gira sul thread UI (frame callback di Reanimated) e i pezzi leggono la propria
 * posizione direttamente dallo stato fisico condiviso: nessun passaggio dal thread JS né render React
 * per frame. Quando la pila è ferma il frame callback si spegne, quindi a riposo non consuma nulla.
 *
 * Annullando un pezzo, l'ultimo arrivato fa un piccolo "pop" (si gonfia, ruota e svanisce) e solo
 * dopo esce dalla simulazione, così i pezzi sopra ricadono nello spazio lasciato libero.
 */

// Intervallo tra un pezzo e l'altro quando ne vanno aggiunti molti insieme (es. rientro in partita)
const STAGGER_MS = 70;
// Durata dell'effetto di scomparsa di un pezzo annullato
export const VANISH_MS = 320;
const IS_WEB = Platform.OS === 'web';

interface SushiStackProps {
  pieceCount: number;
}

interface Sprite extends PieceShape {
  id: number;
  slot: number;
  vanishing?: boolean;
}

interface Spawn {
  slot: number;
  params: SpawnParams;
}

function syncWorld(world: SharedValue<number[]>, removals: number[], spawns: Spawn[], seq: number) {
  'worklet';
  const w = world.value;
  for (let i = 0; i < removals.length; i++) removeBody(w, removals[i]);
  for (let i = 0; i < spawns.length; i++) spawnBody(w, spawns[i].slot, spawns[i].params);
  wakeWorld(w, seq);
  world.modify();
}

function resizeWorld(world: SharedValue<number[]>, width: number, height: number, seq: number) {
  'worklet';
  const w = world.value;
  setWorldBounds(w, width, height);
  wakeWorld(w, seq);
  world.modify();
}

const HIDDEN_STYLE = {
  opacity: 1,
  transform: [{ translateX: 0 }, { translateY: -10000 }, { rotate: '0rad' }, { translateY: 0 }, { scale: 1 }],
};

const SushiSprite = memo(function SushiSprite({ sprite, world }: { sprite: Sprite; world: SharedValue<number[]> }) {
  const { slot, width, height, offsetY, kind, vanishing } = sprite;
  // 0 → 1 durante la scomparsa
  const vanish = useSharedValue(0);

  useEffect(() => {
    if (vanishing) vanish.value = withTiming(1, { duration: VANISH_MS, easing: Easing.inOut(Easing.quad) });
  }, [vanishing, vanish]);

  const animatedStyle = useAnimatedStyle(() => {
    // Sul thread JS (primo render) non si legge lo stato fisico: richiederebbe una copia sincrona
    if (!globalThis._WORKLET && !IS_WEB) return HIDDEN_STYLE;
    const w = world.value;
    const o = bodyOffset(slot);
    const v = vanish.value;
    // "Pop": prima si gonfia un poco, poi si rimpicciolisce ruotando e sfuma
    const scale = v < 0.3 ? 1 + v * 0.6 : 1.18 * (1 - (v - 0.3) / 0.7);
    return {
      opacity: 1 - v * v,
      transform: [
        { translateX: w[o + B_X] - width / 2 },
        { translateY: w[o + B_Y] - height / 2 },
        { rotate: `${w[o + B_ANGLE] + v * 1.4}rad` },
        { translateY: offsetY },
        { scale },
      ],
    };
  });

  return (
    <Animated.Image
      source={SUSHI_KINDS[kind].source}
      resizeMode="contain"
      fadeDuration={0}
      style={[styles.sprite, { width, height }, animatedStyle]}
    />
  );
});

const SushiStack: React.FC<SushiStackProps> = ({ pieceCount }) => {
  const [initialWorld] = useState(createWorld);
  const world = useSharedValue(initialWorld);
  const [sprites, setSprites] = useState<Sprite[]>([]);
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

  const spritesRef = useRef<Sprite[]>([]);
  // Pezzi annullati che stanno ancora svanendo (occupano lo slot fino alla fine dell'effetto)
  const vanishingRef = useRef<Sprite[]>([]);
  const vanishTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const layoutRef = useRef(layout);
  const targetRef = useRef(pieceCount);
  // Pezzi "logici" (punteggio) già rappresentati, anche se i più vecchi sono stati tolti per il limite
  const representedRef = useRef(0);
  const freeSlotsRef = useRef(Array.from({ length: MAX_BODIES }, (_, i) => MAX_BODIES - 1 - i));
  const nextIdRef = useRef(0);
  const seqRef = useRef(0);
  // pump si riprogramma da sola: il timer usa l'ultima versione tramite ref
  const pumpRef = useRef<() => void>(() => undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameCallbackRef = useRef<{ setActive: (active: boolean) => void } | null>(null);

  // Il thread UI segnala che la pila è ferma: si spegne il frame callback, a meno che nel frattempo
  // il thread JS non l'abbia già risvegliata (sequenza più recente)
  const onSettled = useCallback((seq: number) => {
    if (seq === seqRef.current) frameCallbackRef.current?.setActive(false);
  }, []);

  const step = useCallback(
    (frame: FrameInfo) => {
      'worklet';
      const w = world.value;
      if (isIdle(w)) return;
      const dt = frame.timeSincePreviousFrame == null ? 1 / 60 : frame.timeSincePreviousFrame / 1000;
      const settled = advanceWorld(w, dt);
      world.modify();
      if (settled) scheduleOnRN(onSettled, worldSeq(w));
    },
    [world, onSettled]
  );

  const frameCallback = useFrameCallback(step, false);
  useEffect(() => {
    frameCallbackRef.current = frameCallback;
  }, [frameCallback]);

  const wake = useCallback(() => {
    seqRef.current += 1;
    return seqRef.current;
  }, []);

  const publish = useCallback((active: Sprite[]) => {
    spritesRef.current = active;
    setSprites([...active, ...vanishingRef.current]);
  }, []);

  // Fine dell'effetto: il pezzo esce dalla simulazione e quelli sopra ricadono
  const finishVanish = useCallback(
    (sprite: Sprite) => {
      vanishingRef.current = vanishingRef.current.filter((s) => s.id !== sprite.id);
      freeSlotsRef.current.push(sprite.slot);
      scheduleOnUI(syncWorld, world, [sprite.slot], [], wake());
      frameCallbackRef.current?.setActive(true);
      publish(spritesRef.current);
    },
    [world, wake, publish]
  );

  const startVanish = useCallback(
    (sprite: Sprite) => {
      const leaving = { ...sprite, vanishing: true };
      vanishingRef.current = [...vanishingRef.current, leaving];
      const timer = setTimeout(() => {
        vanishTimersRef.current.delete(timer);
        finishVanish(leaving);
      }, VANISH_MS);
      vanishTimersRef.current.add(timer);
    },
    [finishVanish]
  );

  // Porta i pezzi visibili al punteggio: annullamenti subito (con effetto), aggiunte una alla volta
  const pump = useCallback(() => {
    timerRef.current = null;
    const size = layoutRef.current;
    if (!size) return;

    const target = targetRef.current;
    const freeSlots = freeSlotsRef.current;
    let represented = representedRef.current;
    let list = spritesRef.current;
    const removals: number[] = [];
    const spawns: Spawn[] = [];
    let vanished = false;

    while (represented > target) {
      const last = list[list.length - 1];
      if (last) {
        list = list.slice(0, -1);
        startVanish(last);
        vanished = true;
      }
      represented -= 1;
    }

    // In un salto molto grande (es. rientro in una partita avanzata) i pezzi che verrebbero subito
    // scartati per il limite non vengono nemmeno creati
    if (target - represented > MAX_BODIES) represented = target - MAX_BODIES;

    if (represented < target) {
      if (list.length + vanishingRef.current.length >= MAX_BODIES && list.length > 0) {
        const oldest = list[0];
        removals.push(oldest.slot);
        freeSlots.push(oldest.slot);
        list = list.slice(1);
      }
      const slot = freeSlots.pop();
      if (slot !== undefined) {
        const shape = createPieceShape();
        spawns.push({ slot, params: createSpawnParams(shape, size.width) });
        list = [...list, { ...shape, id: nextIdRef.current++, slot }];
      }
      represented += 1;
    }

    representedRef.current = represented;
    if (removals.length > 0 || spawns.length > 0) {
      scheduleOnUI(syncWorld, world, removals, spawns, wake());
      frameCallbackRef.current?.setActive(true);
    }
    if (removals.length > 0 || spawns.length > 0 || vanished) publish(list);
    if (represented < target) timerRef.current = setTimeout(() => pumpRef.current(), STAGGER_MS);
  }, [world, wake, publish, startVanish]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  useEffect(() => {
    if (!layout) return;
    layoutRef.current = layout;
    scheduleOnUI(resizeWorld, world, layout.width, layout.height, wake());
    frameCallbackRef.current?.setActive(true);
  }, [layout, world, wake]);

  useEffect(() => {
    targetRef.current = pieceCount;
    if (!layout) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    pump();
  }, [pieceCount, layout, pump]);

  useEffect(() => {
    const vanishTimers = vanishTimersRef.current;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      vanishTimers.forEach(clearTimeout);
    };
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  return (
    <View style={styles.container} pointerEvents="none" onLayout={onLayout} testID="sushi-stack">
      {sprites.map((sprite) => (
        <SushiSprite key={sprite.id} sprite={sprite} world={world} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  sprite: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

export default memo(SushiStack);
