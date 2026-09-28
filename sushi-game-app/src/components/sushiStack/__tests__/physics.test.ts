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
  wakeWorld,
  worldSeq,
} from '../physics';
import { createPieceShape, createSpawnParams, pickKind, SUSHI_KINDS } from '../pieces';

const WIDTH = 390;
const HEIGHT = 780;
const FRAME = 1 / 60;

// Generatore pseudo-casuale deterministico, per simulazioni riproducibili
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Body {
  x: number;
  y: number;
  r: number;
}

function createScene(seed = 1) {
  const random = seeded(seed);
  const w = createWorld();
  setWorldBounds(w, WIDTH, HEIGHT);
  const free = Array.from({ length: MAX_BODIES }, (_, i) => MAX_BODIES - 1 - i);
  const live: number[] = [];
  const radii = new Map<number, number>();
  let seq = 0;

  const spawn = () => {
    if (live.length >= MAX_BODIES) {
      const oldest = live.shift()!;
      removeBody(w, oldest);
      free.push(oldest);
    }
    const slot = free.pop()!;
    const params = createSpawnParams(createPieceShape(random), WIDTH, random);
    spawnBody(w, slot, params);
    radii.set(slot, params.radius);
    live.push(slot);
    wakeWorld(w, ++seq);
  };

  const remove = (slot: number) => {
    removeBody(w, slot);
    live.splice(live.indexOf(slot), 1);
    free.push(slot);
    wakeWorld(w, ++seq);
  };

  // Avanza fino al riposo (o al limite di tempo); restituisce i secondi impiegati
  const runUntilSettled = (maxSeconds = 12) => {
    for (let t = 0; t < maxSeconds; t += FRAME) {
      if (advanceWorld(w, FRAME)) return t;
    }
    return Infinity;
  };

  const bodies = (): Body[] =>
    live.map((slot) => {
      const o = bodyOffset(slot);
      return { x: w[o + B_X], y: w[o + B_Y], r: radii.get(slot)! };
    });

  return { w, live, spawn, remove, runUntilSettled, bodies, nextSeq: () => ++seq };
}

function checkPile(bodies: Body[]) {
  let maxOverlap = 0;
  let floating = 0;
  let outside = 0;
  bodies.forEach((a, i) => {
    if (a.x - a.r < -0.5 || a.x + a.r > WIDTH + 0.5 || a.y + a.r > HEIGHT + 0.5) outside++;
    let supported = a.y + a.r >= HEIGHT - 1;
    bodies.forEach((b, j) => {
      if (i === j) return;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (j > i) maxOverlap = Math.max(maxOverlap, a.r + b.r - d);
      if (d < a.r + b.r + 1.5 && b.y > a.y) supported = true;
    });
    if (!supported) floating++;
  });
  return { maxOverlap, floating, outside };
}

describe('fisica della pila di sushi', () => {
  it('un pezzo cade, si appoggia sul fondo e la simulazione si ferma', () => {
    const scene = createScene();
    scene.spawn();
    const settledAfter = scene.runUntilSettled();

    expect(settledAfter).toBeLessThan(3);
    const [piece] = scene.bodies();
    expect(piece.y + piece.r).toBeCloseTo(HEIGHT, 0);
    expect(isIdle(scene.w)).toBe(true);

    // A riposo i frame successivi non cambiano nulla
    const snapshot = [...scene.w];
    expect(advanceWorld(scene.w, FRAME)).toBe(false);
    expect(scene.w).toEqual(snapshot);
  });

  it.each([1, 2, 3])('con molti pezzi forma una pila stabile, compatta e dentro i bordi (seed %i)', (seed) => {
    const scene = createScene(seed);
    // 90 tocchi ravvicinati: gli ultimi 60 pezzi restano visibili
    for (let i = 0; i < 90; i++) {
      scene.spawn();
      for (let f = 0; f < 12; f++) advanceWorld(scene.w, FRAME);
    }
    const settledAfter = scene.runUntilSettled();

    expect(scene.live).toHaveLength(MAX_BODIES);
    expect(settledAfter).toBeLessThan(5);
    const { maxOverlap, floating, outside } = checkPile(scene.bodies());
    expect(outside).toBe(0);
    expect(floating).toBe(0);
    expect(maxOverlap).toBeLessThan(1);
  });

  it('togliendo un pezzo quelli sopra ricadono', () => {
    const scene = createScene(4);
    for (let i = 0; i < 25; i++) {
      scene.spawn();
      scene.runUntilSettled();
    }
    // Si toglie il pezzo più in basso che ne sostiene un altro
    const bodies = scene.bodies();
    const supporting = scene.live.find((slot, i) =>
      bodies.some(
        (b, j) =>
          j !== i && b.y < bodies[i].y && Math.hypot(b.x - bodies[i].x, b.y - bodies[i].y) < b.r + bodies[i].r + 1
      )
    )!;
    scene.remove(supporting);
    expect(isIdle(scene.w)).toBe(false);
    expect(scene.runUntilSettled()).toBeLessThan(5);
    const { floating, maxOverlap } = checkPile(scene.bodies());
    expect(floating).toBe(0);
    expect(maxOverlap).toBeLessThan(1);
  });

  it('se il contenitore si rimpicciolisce i pezzi restano dentro', () => {
    const scene = createScene(5);
    for (let i = 0; i < 20; i++) scene.spawn();
    scene.runUntilSettled();

    setWorldBounds(scene.w, 300, 600);
    wakeWorld(scene.w, scene.nextSeq());
    scene.runUntilSettled();
    for (const b of scene.bodies()) {
      expect(b.x - b.r).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.r).toBeLessThanOrEqual(300.5);
      expect(b.y + b.r).toBeLessThanOrEqual(600.5);
    }
  });

  it('la notifica di riposo riporta la sveglia più recente', () => {
    const scene = createScene();
    scene.spawn();
    const seq = scene.nextSeq();
    wakeWorld(scene.w, seq);
    scene.runUntilSettled();
    expect(worldSeq(scene.w)).toBe(seq);
  });

  it('i pezzi rimossi escono dalla simulazione', () => {
    const scene = createScene();
    scene.spawn();
    const [slot] = scene.live;
    scene.remove(slot);
    expect(scene.w[bodyOffset(slot) + B_Y]).toBeLessThan(-1000);
    // Senza pezzi attivi il mondo si ferma subito
    expect(advanceWorld(scene.w, FRAME)).toBe(true);
    expect(Number.isFinite(scene.w[bodyOffset(slot) + B_ANGLE])).toBe(true);
  });
});

describe('forma dei pezzi', () => {
  it('metà dei pezzi sono nigiri', () => {
    const random = seeded(7);
    const draws = Array.from({ length: 4000 }, () => pickKind(random));
    const nigiri = draws.filter((k) => k === 0 || k === 1).length / draws.length;
    expect(nigiri).toBeGreaterThan(0.45);
    expect(nigiri).toBeLessThan(0.55);
    expect(new Set(draws).size).toBe(SUSHI_KINDS.length);
  });

  it('le dimensioni rispettano le proporzioni delle immagini e il punto di partenza è sopra lo schermo', () => {
    const random = seeded(9);
    for (let i = 0; i < 200; i++) {
      const shape = createPieceShape(random);
      const { aspect } = SUSHI_KINDS[shape.kind];
      expect(shape.width / shape.height).toBeCloseTo(aspect, 5);
      expect(shape.radius).toBeGreaterThan(10);
      expect(shape.radius).toBeLessThan(35);

      const spawn = createSpawnParams(shape, WIDTH, random);
      expect(spawn.x - spawn.radius).toBeGreaterThanOrEqual(0);
      expect(spawn.x + spawn.radius).toBeLessThanOrEqual(WIDTH);
      expect(spawn.y + spawn.radius).toBeLessThan(0);
    }
  });
});
