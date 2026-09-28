import type { ImageSourcePropType } from 'react-native';
import type { SpawnParams } from './physics';

export interface SushiKind {
  source: ImageSourcePropType;
  // Larghezza / altezza dell'immagine
  aspect: number;
  // I pezzi piatti (nigiri, temaki) hanno un collider più basso e si adagiano orizzontali
  flat: boolean;
}

export const SUSHI_KINDS: readonly SushiKind[] = [
  { source: require('../../../assets/sushi-icons/nigiri.png'), aspect: 200 / 116, flat: true },
  { source: require('../../../assets/sushi-icons/nigiri-2.png'), aspect: 206 / 121, flat: true },
  { source: require('../../../assets/sushi-icons/maki.png'), aspect: 166 / 150, flat: false },
  { source: require('../../../assets/sushi-icons/gunkan.png'), aspect: 194 / 184, flat: false },
  { source: require('../../../assets/sushi-icons/sashimi.png'), aspect: 176 / 194, flat: false },
  { source: require('../../../assets/sushi-icons/temaki.png'), aspect: 228 / 119, flat: true },
  { source: require('../../../assets/sushi-icons/uramaki.png'), aspect: 176 / 168, flat: false },
  { source: require('../../../assets/sushi-icons/uramaki-2.png'), aspect: 174 / 176, flat: false },
];

const NIGIRI_KINDS = [0, 1];
const OTHER_KINDS = [2, 3, 4, 5, 6, 7];

// Lato maggiore del pezzo in px; i pezzi piatti sono un po' più grandi per non sembrare minuscoli
const MIN_SIZE = 38;
const MAX_SIZE = 56;
const FLAT_SCALE = 1.2;

export interface PieceShape {
  kind: number;
  width: number;
  height: number;
  radius: number;
  // Spostamento verticale dell'immagine rispetto al centro del collider (nel riferimento del pezzo)
  offsetY: number;
}

type Random = () => number;

// Metà dei pezzi sono nigiri, gli altri tipi si dividono il resto
export function pickKind(random: Random = Math.random): number {
  const group = random() < 0.5 ? NIGIRI_KINDS : OTHER_KINDS;
  return group[Math.min(group.length - 1, Math.floor(random() * group.length))];
}

export function createPieceShape(random: Random = Math.random): PieceShape {
  const kind = pickKind(random);
  const { aspect, flat } = SUSHI_KINDS[kind];
  const size = (MIN_SIZE + random() * (MAX_SIZE - MIN_SIZE)) * (flat ? FLAT_SCALE : 1);
  const width = aspect >= 1 ? size : size * aspect;
  const height = aspect >= 1 ? size / aspect : size;
  // I pezzi tondi sono approssimati da un cerchio poco più piccolo dell'immagine (la pila risulta
  // compatta); quelli piatti da un cerchio alto quanto il pezzo, con l'immagine abbassata in modo che
  // la base tocchi ciò su cui si appoggia
  const radius = flat ? height * 0.5 + width * 0.08 : (width + height) * 0.23;
  const offsetY = flat ? radius - height * 0.5 : 0;
  return { kind, width, height, radius, offsetY };
}

// Posizione e spinta iniziali: il pezzo entra dall'alto con un po' di rotazione
export function createSpawnParams(
  shape: PieceShape,
  containerWidth: number,
  random: Random = Math.random
): SpawnParams {
  const { radius } = shape;
  const flat = SUSHI_KINDS[shape.kind].flat;
  const span = Math.max(0, containerWidth - radius * 2);
  return {
    x: radius + random() * span,
    y: -radius - 10 - random() * 60,
    radius,
    angle: flat ? (random() - 0.5) * 0.9 : (random() * 2 - 1) * Math.PI,
    spin: (random() - 0.5) * 0.05,
    vx: (random() - 0.5) * 1.2,
    vy: 1.5,
    flat,
  };
}
