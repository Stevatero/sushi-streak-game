import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  FrameInfo,
  SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
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
 */

// Intervallo tra un pezzo e l'altro quando ne vanno aggiunti molti insieme (es. rientro in partita)
const STAGGER_MS = 70;
const IS_WEB = Platform.OS === 'web';

interface SushiStackProps {
  pieceCount: number;
}

interface Sprite extends PieceShape {
  id: number;
  slot: number;
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

const HIDDEN_TRANSFORM = [{ translateX: 0 }, { translateY: -10000 }, { rotate: '0rad' }, { translateY: 0 }];

const SushiSprite = memo(function SushiSprite({ sprite, world }: { sprite: Sprite; world: SharedValue<number[]> }) {
  const { slot, width, height, offsetY, kind } = sprite;
  const animatedStyle = useAnimatedStyle(() => {
    // Sul thread JS (primo render) non si legge lo stato fisico: richiederebbe una copia sincrona
    if (!globalThis._WORKLET && !IS_WEB) return { transform: HIDDEN_TRANSFORM };
    const w = world.value;
    const o = bodyOffset(slot);
    return {
      transform: [
        { translateX: w[o + B_X] - width / 2 },
        { translateY: w[o + B_Y] - height / 2 },
        { rotate: `${w[o + B_ANGLE]}rad` },
        { translateY: offsetY },
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
  const layoutRef = useRef(layout);
  const targetRef = useRef(pieceCount);
  // Pezzi "logici" (punteggio) già rappresentati, anche se i più vecchi sono stati tolti per il limite
  const representedRef = useRef(0);
  const freeSlotsRef = useRef(Array.from({ length: MAX_BODIES }, (_, i) => MAX_BODIES - 1 - i));
  const nextIdRef = useRef(0);
  const seqRef = useRef(0);
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

  // Porta i pezzi visibili al punteggio: annullamenti subito, aggiunte una alla volta
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

    while (represented > target) {
      const last = list[list.length - 1];
      if (last) {
        removals.push(last.slot);
        freeSlots.push(last.slot);
        list = list.slice(0, -1);
      }
      represented -= 1;
    }

    // In un salto molto grande (es. rientro in una partita avanzata) i pezzi che verrebbero subito
    // scartati per il limite non vengono nemmeno creati
    if (target - represented > MAX_BODIES) represented = target - MAX_BODIES;

    if (represented < target) {
      if (list.length >= MAX_BODIES) {
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
      spritesRef.current = list;
      setSprites(list);
    }
    if (represented < target) timerRef.current = setTimeout(pump, STAGGER_MS);
  }, [world, wake]);

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

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

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
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  sprite: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

export default memo(SushiStack);
