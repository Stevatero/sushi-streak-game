import { medalColor, podiumOrder, rankOf, sortByScore, winnerText, winnersOf } from '../ranking';

const players = [
  { id: 'a', name: 'Anna', score: 5 },
  { id: 'l', name: 'Luca', score: 7 },
  { id: 'm', name: 'Marta', score: 5 },
  { id: 'g', name: 'Giulio', score: 1 },
];

describe('ranking', () => {
  it('a pari punteggio si condivide il posto', () => {
    expect(players.map((p) => rankOf(players, p.score))).toEqual([2, 1, 2, 4]);
  });

  it('ordina per punteggio mantenendo l’ordine a pari merito', () => {
    expect(sortByScore(players).map((p) => p.name)).toEqual(['Luca', 'Anna', 'Marta', 'Giulio']);
  });

  it('proclama il vincitore, i pareggi e il caso senza pezzi', () => {
    expect(winnerText(players)).toBe('Vince Luca con 7 pezzi!');
    const tie = [
      { id: 'a', name: 'Anna', score: 1 },
      { id: 'l', name: 'Luca', score: 1 },
    ];
    expect(winnerText(tie)).toBe('Pareggio tra Anna e Luca con 1 pezzo!');
    expect(winnersOf(tie)).toHaveLength(2);
    expect(winnerText([{ id: 'a', name: 'Anna', score: 0 }])).toBe('Nessun pezzo mangiato');
    expect(winnerText([])).toBe('Nessun pezzo mangiato');
  });

  it('dispone il podio come secondo, primo, terzo', () => {
    expect(podiumOrder(sortByScore(players)).map((p) => p.name)).toEqual(['Anna', 'Luca', 'Marta']);
    expect(podiumOrder([players[0]]).map((p) => p.name)).toEqual(['Anna']);
  });

  it('assegna le medaglie ai primi tre posti', () => {
    const colors = { gold: 'oro', silver: 'argento', bronze: 'bronzo' };
    expect([1, 2, 3, 4].map((rank) => medalColor(rank, colors))).toEqual(['oro', 'argento', 'bronzo', undefined]);
  });
});
