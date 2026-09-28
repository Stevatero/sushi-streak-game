/**
 * Motore fisico minimale per la pila di sushi.
 *
 * Tutte le funzioni sono worklet: la simulazione gira sul thread UI (frame callback di Reanimated),
 * quindi resta fluida anche quando il thread JS è occupato da React, dal socket o dall'audio.
 *
 * Modello: cerchi con integrazione di Verlet a passo fisso (240 Hz) e vincoli risolti per proiezione
 * (position based dynamics), broadphase sweep-and-prune sull'asse x. I corpi fermi e sostenuti vengono
 * "congelati" (attrito statico) e, quando tutta la pila è ferma, la simulazione si ferma da sola.
 *
 * Nota: il plugin dei worklet trasforma le funzioni in espressioni (non "hoisted") che catturano le
 * funzioni usate al momento della definizione: ogni worklet va dichiarato prima di chi lo chiama.
 *
 * Lo stato è un unico array piatto di numeri (header + corpi + ordinamento), così può vivere in una
 * shared value ed essere letto direttamente dagli stili animati dei pezzi senza copie.
 */

export const MAX_BODIES = 60;

// Header del mondo
const H_WIDTH = 0;
const H_HEIGHT = 1;
const H_SEQ = 2; // numero di sveglia inviato dal thread JS (per ignorare notifiche di riposo superate)
const H_IDLE = 3; // 1 = mondo fermo, in attesa che il thread JS spenga il frame callback
const H_ACC = 4; // tempo accumulato non ancora simulato (s)
const H_WINDOW = 5; // passi trascorsi nella finestra corrente di rilevamento del riposo
const H_AWAKE = 6; // secondi dall'ultima sveglia
const H_COUNT = 7; // corpi attivi
const HEADER = 8;

// Campi di ciascun corpo
export const STRIDE = 18;
const B_ACTIVE = 0;
export const B_X = 1;
export const B_Y = 2;
const B_PX = 3;
const B_PY = 4;
const B_R = 5;
export const B_ANGLE = 6;
const B_SPIN = 7;
const B_FLAT = 8;
const B_CONTACT = 9;
const B_SUPPORT = 10;
const B_REST = 11; // 1 = fermo e appoggiato: niente gravità e niente vincoli con altri pezzi fermi
// Posizione e angolo all'inizio della finestra di riposo
const B_AX = 12;
const B_AY = 13;
const B_AA = 14;
// Posizione a inizio passo (spostamento reale del passo) e passi consecutivi da fermo
const B_SX = 15;
const B_SY = 16;
const B_STILL = 17;

// Indici dei corpi attivi ordinati per bordo sinistro (per la broadphase)
const ORDER = HEADER + MAX_BODIES * STRIDE;
export const WORLD_LENGTH = ORDER + MAX_BODIES;

// Posizione dei corpi inattivi: fuori dallo schermo, così uno slot riusato non "lampeggia"
const PARKED_Y = -10000;

// Parametri della simulazione (distanze in px, velocità in px per passo)
const FIXED_DT = 1 / 240;
const GRAVITY = 2400; // px/s²
const G_STEP = GRAVITY * FIXED_DT * FIXED_DT;
const MAX_STEPS_PER_FRAME = 8;
const MAX_FRAME_DT = 1 / 20;
const ITERATIONS = 3;
const AIR_DAMPING = 0.9995;
const MAX_SPEED = 20;
const RESTITUTION = 0.25;
const WALL_RESTITUTION = 0.3;
const BOUNCE_MIN_SPEED = 1.2;
// Attrito di Coulomb (statico / dinamico), proporzionale alla compenetrazione corretta nel passo:
// con 0.35 un pezzo resta fermo solo vicino alla cima di un altro (circa 20°): niente torri
const FRICTION_STATIC = 0.35;
const FRICTION_KINETIC = 0.25;
// Distanza entro cui due pezzi si considerano ancora a contatto (per il sostegno)
const CONTACT_SLOP = 0.5;
// Compenetrazione tollerata tra due pezzi fermi prima di separarli di nuovo
const REST_OVERLAP = 0.5;
// Nelle coppie in movimento il pezzo più in basso pesa di più: le spinte si propagano verso l'alto e
// la pila resta compatta invece di allargarsi (stabilizzazione delle pile tipica della PBD)
const STACK_MASS = 4;
// Un pezzo fermo è un ostacolo fisso, finché non viene colpito da un pezzo più veloce di così
const WAKE_SPEED = 0.6;
// Sotto questa velocità un corpo sostenuto viene fermato del tutto (evita il tremolio)
const REST_SPEED = 0.07;
// Un pezzo a contatto che non si sposta per questi passi è incastrato: viene fermato anche se il
// sostegno dal basso è scarso (es. tra una parete e un altro pezzo)
const STILL_STEPS = 12;
// Sostegno minimo per restare fermi (o fermarsi perché incastrati): senza, il pezzo torna a cadere
const HOLD_SUPPORT = 0.25;
// Sostegno minimo (somma delle componenti verticali dei contatti) per considerare un corpo appoggiato:
// su un solo pezzo inclinato più di ~40° si scivola, in un incavo tra due pezzi si resta fermi
const SUPPORT_MIN = 0.77;
// Il mondo è fermo quando in una finestra di CALM_STEPS passi nessun pezzo si è spostato più di così
// (la finestra ignora i micro-assestamenti avanti e indietro tipici di una pila compressa)
const CALM_STEPS = 60;
const CALM_DRIFT = 0.4;
const CALM_TURN = 0.01;
// Rete di sicurezza: dopo questo tempo dall'ultima sveglia la simulazione si ferma comunque
const MAX_AWAKE_SECONDS = 8;
const ROLL_BLEND = 0.25;
const FLAT_ROLL = 0.35;
const SETTLE_TORQUE = 0.0025;
const AIR_SPIN_DAMPING = 0.998;
const TWO_PI = Math.PI * 2;

export function createWorld(): number[] {
  const w = new Array<number>(WORLD_LENGTH).fill(0);
  for (let slot = 0; slot < MAX_BODIES; slot++) w[HEADER + slot * STRIDE + B_Y] = PARKED_Y;
  w[H_IDLE] = 1;
  return w;
}

export function bodyOffset(slot: number): number {
  'worklet';
  return HEADER + slot * STRIDE;
}

export function isIdle(w: number[]): boolean {
  'worklet';
  return w[H_IDLE] === 1;
}

export function worldSeq(w: number[]): number {
  'worklet';
  return w[H_SEQ];
}

function resetCalmWindow(w: number[]) {
  'worklet';
  w[H_WINDOW] = 0;
  const n = w[H_COUNT];
  for (let k = 0; k < n; k++) {
    const o = HEADER + w[ORDER + k] * STRIDE;
    w[o + B_AX] = w[o + B_X];
    w[o + B_AY] = w[o + B_Y];
    w[o + B_AA] = w[o + B_ANGLE];
  }
}

// Vero se nessun pezzo si è spostato (o ruotato) in modo apprezzabile dall'inizio della finestra
function isCalm(w: number[]): boolean {
  'worklet';
  const n = w[H_COUNT];
  for (let k = 0; k < n; k++) {
    const o = HEADER + w[ORDER + k] * STRIDE;
    const dx = w[o + B_X] - w[o + B_AX];
    const dy = w[o + B_Y] - w[o + B_AY];
    if (dx * dx + dy * dy > CALM_DRIFT * CALM_DRIFT) return false;
    let turn = Math.abs(w[o + B_ANGLE] - w[o + B_AA]);
    if (turn > Math.PI) turn = TWO_PI - turn;
    if (turn > CALM_TURN) return false;
  }
  return true;
}

// Riavvia la simulazione (nuovo pezzo, pezzo rimosso, cambio dimensioni)
export function wakeWorld(w: number[], seq: number) {
  'worklet';
  w[H_SEQ] = seq;
  w[H_IDLE] = 0;
  w[H_AWAKE] = 0;
  resetCalmWindow(w);
}

export interface SpawnParams {
  x: number;
  y: number;
  radius: number;
  angle: number;
  spin: number;
  vx: number;
  vy: number;
  flat: boolean;
}

export function spawnBody(w: number[], slot: number, p: SpawnParams) {
  'worklet';
  if (slot < 0 || slot >= MAX_BODIES) return;
  const o = HEADER + slot * STRIDE;
  if (w[o + B_ACTIVE] !== 1) {
    w[ORDER + w[H_COUNT]] = slot;
    w[H_COUNT] += 1;
  }
  w[o + B_ACTIVE] = 1;
  w[o + B_X] = p.x;
  w[o + B_Y] = p.y;
  w[o + B_PX] = p.x - p.vx;
  w[o + B_PY] = p.y - p.vy;
  w[o + B_R] = p.radius;
  w[o + B_ANGLE] = p.angle;
  w[o + B_SPIN] = p.spin;
  w[o + B_FLAT] = p.flat ? 1 : 0;
  w[o + B_CONTACT] = 0;
  w[o + B_SUPPORT] = 0;
  w[o + B_REST] = 0;
  w[o + B_AX] = p.x;
  w[o + B_AY] = p.y;
  w[o + B_AA] = p.angle;
  w[o + B_SX] = p.x;
  w[o + B_SY] = p.y;
  w[o + B_STILL] = 0;
}

export function removeBody(w: number[], slot: number) {
  'worklet';
  if (slot < 0 || slot >= MAX_BODIES) return;
  const o = HEADER + slot * STRIDE;
  if (w[o + B_ACTIVE] !== 1) return;
  w[o + B_ACTIVE] = 0;
  w[o + B_Y] = PARKED_Y;
  w[o + B_PY] = PARKED_Y;
  const n = w[H_COUNT];
  let k = 0;
  while (k < n && w[ORDER + k] !== slot) k++;
  for (; k < n - 1; k++) w[ORDER + k] = w[ORDER + k + 1];
  w[H_COUNT] = Math.max(0, n - 1);
}

// Aggiorna le dimensioni del contenitore riportando dentro i corpi senza dare loro velocità
export function setWorldBounds(w: number[], width: number, height: number) {
  'worklet';
  w[H_WIDTH] = width;
  w[H_HEIGHT] = height;
  const n = w[H_COUNT];
  for (let k = 0; k < n; k++) {
    const o = HEADER + w[ORDER + k] * STRIDE;
    const r = w[o + B_R];
    const x = Math.min(Math.max(w[o + B_X], r), Math.max(r, width - r));
    const y = Math.min(w[o + B_Y], height - r);
    w[o + B_X] = x;
    w[o + B_Y] = y;
    w[o + B_PX] = x;
    w[o + B_PY] = y;
    w[o + B_REST] = 0;
  }
}

function integrate(w: number[], n: number) {
  'worklet';
  for (let k = 0; k < n; k++) {
    const o = HEADER + w[ORDER + k] * STRIDE;
    w[o + B_CONTACT] = 0;
    w[o + B_SUPPORT] = 0;
    if (w[o + B_REST] === 1) {
      w[o + B_SX] = w[o + B_X];
      w[o + B_SY] = w[o + B_Y];
      continue;
    }
    let vx = (w[o + B_X] - w[o + B_PX]) * AIR_DAMPING;
    let vy = (w[o + B_Y] - w[o + B_PY]) * AIR_DAMPING + G_STEP;
    const speed2 = vx * vx + vy * vy;
    if (speed2 > MAX_SPEED * MAX_SPEED) {
      const scale = MAX_SPEED / Math.sqrt(speed2);
      vx *= scale;
      vy *= scale;
    }
    w[o + B_PX] = w[o + B_X];
    w[o + B_PY] = w[o + B_Y];
    w[o + B_SX] = w[o + B_X];
    w[o + B_SY] = w[o + B_Y];
    w[o + B_X] += vx;
    w[o + B_Y] += vy;
  }
}

// Ordinamento per inserzione sul bordo sinistro: tra un passo e l'altro l'ordine cambia poco, quindi è ~O(n)
function sortByLeftEdge(w: number[], n: number) {
  'worklet';
  for (let a = 1; a < n; a++) {
    const slot = w[ORDER + a];
    const o = HEADER + slot * STRIDE;
    const key = w[o + B_X] - w[o + B_R];
    let b = a - 1;
    while (b >= 0) {
      const ob = HEADER + w[ORDER + b] * STRIDE;
      if (w[ob + B_X] - w[ob + B_R] <= key) break;
      w[ORDER + b + 1] = w[ORDER + b];
      b--;
    }
    w[ORDER + b + 1] = slot;
  }
}

function solveContacts(w: number[], n: number, computeSupport: boolean) {
  'worklet';
  for (let a = 0; a < n; a++) {
    const oi = HEADER + w[ORDER + a] * STRIDE;
    const ri = w[oi + B_R];
    for (let b = a + 1; b < n; b++) {
      const oj = HEADER + w[ORDER + b] * STRIDE;
      const rj = w[oj + B_R];
      // Ordinati per bordo sinistro: oltre il bordo destro di i non ci sono altri contatti
      if (w[oj + B_X] - rj > w[oi + B_X] + ri) break;
      const restI = w[oi + B_REST] === 1;
      const restJ = w[oj + B_REST] === 1;
      // Due pezzi fermi non si muovono l'uno rispetto all'altro: basta verificare che si sostengano
      if (restI && restJ && !computeSupport) continue;
      const dx = w[oj + B_X] - w[oi + B_X];
      const dy = w[oj + B_Y] - w[oi + B_Y];
      const rs = ri + rj;
      const d2 = dx * dx + dy * dy;
      // Tra pezzi fermi si tollera una minima compenetrazione prima di separarli di nuovo
      const minDist = restI && restJ ? rs - REST_OVERLAP : rs;
      if (d2 >= minDist * minDist) {
        // Nell'ultima iterazione i pezzi appena separati contano comunque come appoggiati
        if (computeSupport && d2 < (rs + CONTACT_SLOP) * (rs + CONTACT_SLOP) && d2 > 1e-12) {
          const sy = dy / Math.sqrt(d2);
          w[oi + B_CONTACT] = 1;
          w[oj + B_CONTACT] = 1;
          if (sy > 0) w[oi + B_SUPPORT] += sy;
          else w[oj + B_SUPPORT] -= sy;
        }
        continue;
      }

      let d = Math.sqrt(d2);
      let nx = 0;
      let ny = 1;
      if (d > 1e-6) {
        nx = dx / d;
        ny = dy / d;
      } else {
        d = 0;
      }

      // Quota di correzione di ciascun pezzo: un pezzo fermo resta fisso se l'urto è lieve,
      // altrimenti si risveglia; tra pezzi in movimento pesa di più quello più grande e più in basso
      let wi = 0.5;
      let wj = 0.5;
      const vix = w[oi + B_X] - w[oi + B_PX];
      const viy = w[oi + B_Y] - w[oi + B_PY];
      const vjx = w[oj + B_X] - w[oj + B_PX];
      const vjy = w[oj + B_Y] - w[oj + B_PY];
      if (restI !== restJ) {
        const mover = restI ? vjx * vjx + vjy * vjy : vix * vix + viy * viy;
        if (mover > WAKE_SPEED * WAKE_SPEED) {
          w[oi + B_REST] = 0;
          w[oj + B_REST] = 0;
        }
      } else if (restI && restJ) {
        w[oi + B_REST] = 0;
        w[oj + B_REST] = 0;
      }
      if (w[oi + B_REST] === 1) {
        wi = 0;
        wj = 1;
      } else if (w[oj + B_REST] === 1) {
        wi = 1;
        wj = 0;
      } else {
        let mi = ri * ri;
        let mj = rj * rj;
        if (dy > 0) mj *= STACK_MASS;
        else mi *= STACK_MASS;
        wi = mj / (mi + mj);
        wj = mi / (mi + mj);
      }

      const overlap = rs - d;
      w[oi + B_X] -= nx * overlap * wi;
      w[oi + B_Y] -= ny * overlap * wi;
      w[oj + B_X] += nx * overlap * wj;
      w[oj + B_Y] += ny * overlap * wj;

      // Attrito: annulla (statico) o riduce (dinamico) lo spostamento relativo tangenziale del passo
      const rvx = w[oi + B_X] - w[oi + B_PX] - (w[oj + B_X] - w[oj + B_PX]);
      const rvy = w[oi + B_Y] - w[oi + B_PY] - (w[oj + B_Y] - w[oj + B_PY]);
      const vn = rvx * nx + rvy * ny;
      let tx = rvx - vn * nx;
      let ty = rvy - vn * ny;
      const tl = Math.sqrt(tx * tx + ty * ty);
      if (tl > 1e-9) {
        const k = tl < FRICTION_STATIC * overlap ? 1 : Math.min((FRICTION_KINETIC * overlap) / tl, 1);
        tx *= k;
        ty *= k;
        w[oi + B_X] -= tx * wi;
        w[oi + B_Y] -= ty * wi;
        w[oj + B_X] += tx * wj;
        w[oj + B_Y] += ty * wj;
      }

      if (computeSupport) {
        w[oi + B_CONTACT] = 1;
        w[oj + B_CONTACT] = 1;
        // n va da i a j: con ny > 0 il pezzo j sta sotto e sostiene i
        if (ny > 0) w[oi + B_SUPPORT] += ny;
        else w[oj + B_SUPPORT] -= ny;
      }
    }
  }
}

function solveBounds(w: number[], n: number, width: number, height: number) {
  'worklet';
  for (let k = 0; k < n; k++) {
    const o = HEADER + w[ORDER + k] * STRIDE;
    const r = w[o + B_R];
    const depth = w[o + B_Y] + r - height;
    if (depth > 0) {
      const vy = w[o + B_Y] - w[o + B_PY];
      w[o + B_Y] = height - r;
      w[o + B_PY] = vy > BOUNCE_MIN_SPEED ? w[o + B_Y] + vy * RESTITUTION : w[o + B_Y];
      // Attrito col fondo
      const vx = w[o + B_X] - w[o + B_PX];
      const ax = Math.abs(vx);
      if (ax > 1e-9) {
        const kf = ax < FRICTION_STATIC * depth ? 1 : Math.min((FRICTION_KINETIC * depth) / ax, 1);
        w[o + B_X] -= vx * kf;
      }
      w[o + B_CONTACT] = 1;
      w[o + B_SUPPORT] = Math.max(w[o + B_SUPPORT], 1);
    } else if (depth > -CONTACT_SLOP) {
      w[o + B_CONTACT] = 1;
      w[o + B_SUPPORT] = Math.max(w[o + B_SUPPORT], 1);
    }
    if (w[o + B_X] - r < 0) {
      const vx = w[o + B_X] - w[o + B_PX];
      w[o + B_X] = r;
      w[o + B_PX] = r + (vx < 0 ? vx * WALL_RESTITUTION : 0);
    } else if (w[o + B_X] + r > width) {
      const vx = w[o + B_X] - w[o + B_PX];
      w[o + B_X] = width - r;
      w[o + B_PX] = width - r + (vx > 0 ? vx * WALL_RESTITUTION : 0);
    }
    if (w[o + B_X] - r < CONTACT_SLOP || w[o + B_X] + r > width - CONTACT_SLOP) w[o + B_CONTACT] = 1;
  }
}

// Rotazione (solo visiva) e attrito statico: i pezzi appoggiati e quasi fermi vengono fermati del tutto
function finishStep(w: number[], n: number) {
  'worklet';
  for (let k = 0; k < n; k++) {
    const o = HEADER + w[ORDER + k] * STRIDE;
    const vx = w[o + B_X] - w[o + B_PX];
    const vy = w[o + B_Y] - w[o + B_PY];
    const speed2 = vx * vx + vy * vy;
    // Spostamento reale del passo (le velocità possono essere state alterate da rimbalzi e pareti)
    const mx = w[o + B_X] - w[o + B_SX];
    const my = w[o + B_Y] - w[o + B_SY];
    const moved2 = mx * mx + my * my;
    const contact = w[o + B_CONTACT] === 1;
    const support = w[o + B_SUPPORT];
    const flat = w[o + B_FLAT] === 1;
    let spin = w[o + B_SPIN];

    if (contact) {
      // A contatto i pezzi rotolano; quelli piatti (nigiri, temaki) tendono ad adagiarsi orizzontali
      const roll = (mx / w[o + B_R]) * (flat ? FLAT_ROLL : 1);
      spin += (roll - spin) * ROLL_BLEND;
      if (flat && support >= SUPPORT_MIN) spin -= Math.sin(2 * w[o + B_ANGLE]) * SETTLE_TORQUE;
    } else {
      spin *= AIR_SPIN_DAMPING;
    }

    const slow = speed2 < REST_SPEED * REST_SPEED && moved2 < REST_SPEED * REST_SPEED;
    const still = contact && moved2 < REST_SPEED * REST_SPEED ? w[o + B_STILL] + 1 : 0;
    w[o + B_STILL] = still;
    const held = support >= HOLD_SUPPORT;
    const resting = w[o + B_REST] === 1;
    if ((resting && held) || (support >= SUPPORT_MIN && slow) || (held && still >= STILL_STEPS)) {
      w[o + B_PX] = w[o + B_X];
      w[o + B_PY] = w[o + B_Y];
      w[o + B_REST] = 1;
    } else {
      w[o + B_REST] = 0;
    }

    let angle = w[o + B_ANGLE] + spin;
    if (angle > Math.PI) angle -= TWO_PI;
    else if (angle < -Math.PI) angle += TWO_PI;
    w[o + B_ANGLE] = angle;
    w[o + B_SPIN] = spin;
  }
}

function substep(w: number[]) {
  'worklet';
  const n = w[H_COUNT];
  const width = w[H_WIDTH];
  const height = w[H_HEIGHT];
  integrate(w, n);
  sortByLeftEdge(w, n);
  for (let it = 0; it < ITERATIONS; it++) {
    const last = it === ITERATIONS - 1;
    solveContacts(w, n, last);
    solveBounds(w, n, width, height);
  }
  finishStep(w, n);
}

/**
 * Avanza la simulazione del tempo trascorso dall'ultimo frame (in secondi).
 * Restituisce true solo nel frame in cui il mondo diventa fermo: da quel momento i frame successivi
 * non fanno nulla finché una nuova sveglia (wakeWorld) non lo riattiva.
 */
export function advanceWorld(w: number[], frameSeconds: number): boolean {
  'worklet';
  if (w[H_IDLE] === 1) return false;
  if (w[H_WIDTH] <= 0 || w[H_HEIGHT] <= 0) return false;

  const dt = Math.min(Math.max(frameSeconds, 0), MAX_FRAME_DT);
  let acc = w[H_ACC] + dt;
  let steps = 0;
  let settled = false;
  while (acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    substep(w);
    acc -= FIXED_DT;
    steps++;
    w[H_WINDOW] += 1;
    if (w[H_WINDOW] >= CALM_STEPS) {
      if (isCalm(w)) settled = true;
      resetCalmWindow(w);
    }
  }
  // Se il dispositivo è rimasto molto indietro si scarta il tempo residuo invece di accumularlo
  w[H_ACC] = steps === MAX_STEPS_PER_FRAME ? 0 : acc;
  w[H_AWAKE] += dt;

  if (settled || w[H_AWAKE] >= MAX_AWAKE_SECONDS || w[H_COUNT] === 0) {
    w[H_IDLE] = 1;
    w[H_ACC] = 0;
    return true;
  }
  return false;
}
