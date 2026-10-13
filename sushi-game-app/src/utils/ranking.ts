import { plural } from './plural';

export interface RankedPlayer {
  id: string;
  name: string;
  score: number;
}

// Posizione "sportiva": a pari punteggio si condivide il posto (1, 2, 2, 4)
export const rankOf = (players: readonly RankedPlayer[], score: number) =>
  1 + players.filter((p) => p.score > score).length;

// Colore della medaglia per i primi tre posti
export const medalColor = (rank: number, colors: { gold: string; silver: string; bronze: string }) =>
  rank === 1 ? colors.gold : rank === 2 ? colors.silver : rank === 3 ? colors.bronze : undefined;

export const sortByScore = <T extends RankedPlayer>(players: readonly T[]) =>
  [...players].sort((a, b) => b.score - a.score);

// Vincitori a pari merito (nessuno se nessuno ha mangiato)
export function winnersOf<T extends RankedPlayer>(players: readonly T[]): T[] {
  const top = Math.max(0, ...players.map((p) => p.score));
  return top > 0 ? players.filter((p) => p.score === top) : [];
}

export function winnerText(players: readonly RankedPlayer[]) {
  const winners = winnersOf(players);
  if (winners.length === 0) return 'Nessun pezzo mangiato';
  const pieces = plural(winners[0].score, 'pezzo', 'pezzi');
  return winners.length > 1
    ? `Pareggio tra ${winners.map((p) => p.name).join(' e ')} con ${pieces}!`
    : `Vince ${winners[0].name} con ${pieces}!`;
}

// Primi tre in ordine da podio: secondo, primo, terzo
export function podiumOrder<T extends RankedPlayer>(sorted: readonly T[]): T[] {
  const podium = sorted.slice(0, 3);
  return podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
}
