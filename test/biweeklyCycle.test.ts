import { biweeklyRangeAt, previousBiweeklyComparison } from '../src/domain/biweeklyCycle';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const ANCHOR = '2026-10-11'; // domingo

describe('biweeklyRangeAt', () => {
  it('el ciclo va de domingo 00:00 a sábado 23:59 (dom 11 a sáb 24)', () => {
    const now = new Date(2026, 9, 15);
    expect(biweeklyRangeAt(ANCHOR, 0, now)).toEqual({ start: day(2026, 10, 11), end: day(2026, 10, 25) });
  });

  it('el offset navega a ciclos anteriores', () => {
    const now = new Date(2026, 9, 15);
    expect(biweeklyRangeAt(ANCHOR, -1, now)).toEqual({ start: day(2026, 9, 27), end: day(2026, 10, 11) });
  });
});

describe('previousBiweeklyComparison', () => {
  it('en el ciclo en curso compara solo los primeros días transcurridos', () => {
    const cmp = previousBiweeklyComparison(ANCHOR, 0, new Date(2026, 9, 13)); // 3er día del ciclo
    expect(cmp).toEqual({ range: { start: day(2026, 9, 27), end: day(2026, 9, 30) }, partial: true, days: 3 });
  });

  it('en un ciclo cerrado compara el ciclo anterior completo', () => {
    const cmp = previousBiweeklyComparison(ANCHOR, -1, new Date(2026, 9, 13));
    expect(cmp).toEqual({ range: { start: day(2026, 9, 13), end: day(2026, 9, 27) }, partial: false, days: 0 });
  });
});
