import { categoryChange, previousMonthComparison } from '../src/domain/categoryChange';

describe('categoryChange', () => {
  it('calcula suba y baja redondeadas', () => {
    expect(categoryChange(112, 100)).toEqual({ kind: 'up', percent: 12 });
    expect(categoryChange(50, 200)).toEqual({ kind: 'down', percent: 75 });
  });

  it('sin base previa es nuevo; una variación menor al 0,5% es igual', () => {
    expect(categoryChange(30, 0)).toEqual({ kind: 'new' });
    expect(categoryChange(0, 0)).toEqual({ kind: 'same' });
    expect(categoryChange(1001, 1000)).toEqual({ kind: 'same' });
  });
});

describe('previousMonthComparison', () => {
  const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();

  it('un mes cerrado se compara contra el mes anterior completo', () => {
    expect(previousMonthComparison('2026-08', new Date(2026, 8, 20))).toEqual({
      range: { start: iso(2026, 7, 1), end: iso(2026, 8, 1) },
      partial: false,
      days: 0,
    });
  });

  it('el mes en curso se compara contra los mismos primeros días del mes anterior', () => {
    expect(previousMonthComparison('2026-09', new Date(2026, 8, 8, 15))).toEqual({
      range: { start: iso(2026, 8, 1), end: iso(2026, 8, 9) },
      partial: true,
      days: 8,
    });
  });

  it('no se pasa del mes anterior cuando este tiene más días', () => {
    // 31 de octubre contra septiembre (30 días): el rango termina el 1 de octubre.
    const comparison = previousMonthComparison('2026-10', new Date(2026, 9, 31));
    expect(comparison.range.end).toBe(iso(2026, 10, 1));
    expect(comparison.days).toBe(30); // no 31: septiembre solo tiene 30 días
  });
});
