import { plural } from '../plural';

describe('plural', () => {
  it('usa il singolare solo per 1', () => {
    expect(plural(1, 'pezzo', 'pezzi')).toBe('1 pezzo');
    expect(plural(0, 'pezzo', 'pezzi')).toBe('0 pezzi');
    expect(plural(2, 'giocatore', 'giocatori')).toBe('2 giocatori');
  });
});
