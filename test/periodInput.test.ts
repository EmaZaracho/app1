import {
  buildPeriodFromInput,
  describePeriod,
  formatDayMonthYear,
  maskDayMonthYear,
  parseDayMonthYear,
} from '../src/domain/periodInput';
import { filterMovements } from '../src/domain/movementFilters';
import type { Movement } from '../src/types';

describe('parseDayMonthYear', () => {
  it('acepta dd/mm/aa y dd/mm/aaaa como medianoche local', () => {
    expect(parseDayMonthYear('01/09/26')).toEqual(new Date(2026, 8, 1));
    expect(parseDayMonthYear('1/9/2026')).toEqual(new Date(2026, 8, 1));
    expect(parseDayMonthYear(' 15-03-25 ')).toEqual(new Date(2025, 2, 15));
  });

  it('rechaza fechas inexistentes o mal escritas', () => {
    expect(parseDayMonthYear('31/02/26')).toBeNull();
    expect(parseDayMonthYear('00/01/26')).toBeNull();
    expect(parseDayMonthYear('10/13/26')).toBeNull();
    expect(parseDayMonthYear('10/09/202')).toBeNull();
    expect(parseDayMonthYear('')).toBeNull();
    expect(parseDayMonthYear('ayer')).toBeNull();
  });

  it('acepta el 29/02 solo en años bisiestos', () => {
    expect(parseDayMonthYear('29/02/28')).toEqual(new Date(2028, 1, 29));
    expect(parseDayMonthYear('29/02/26')).toBeNull();
  });
});

describe('maskDayMonthYear', () => {
  it('inserta las barras mientras se tipea', () => {
    expect(maskDayMonthYear('0')).toBe('0');
    expect(maskDayMonthYear('010')).toBe('01/0');
    expect(maskDayMonthYear('010926')).toBe('01/09/26');
    expect(maskDayMonthYear('01092026')).toBe('01/09/2026');
    expect(maskDayMonthYear('01/09/2026123')).toBe('01/09/2026');
  });
});

describe('buildPeriodFromInput', () => {
  it('incluye completo el último día (fin exclusivo al día siguiente)', () => {
    const result = buildPeriodFromInput('01/09/26', '15/09/26');
    expect(result).toEqual({
      ok: true,
      period: { start: new Date(2026, 8, 1).toISOString(), end: new Date(2026, 8, 16).toISOString() },
    });
  });

  it('permite un período de un solo día', () => {
    const result = buildPeriodFromInput('20/07/26', '20/07/26');
    expect(result.ok && result.period.end).toBe(new Date(2026, 6, 21).toISOString());
  });

  it('informa qué fecha es inválida y si el fin es anterior al inicio', () => {
    expect(buildPeriodFromInput('32/01/26', '01/02/26')).toEqual({
      ok: false,
      error: 'La fecha de inicio no es válida. Usá dd/mm/aa.',
    });
    expect(buildPeriodFromInput('01/01/26', '')).toEqual({
      ok: false,
      error: 'La fecha de fin no es válida. Usá dd/mm/aa.',
    });
    expect(buildPeriodFromInput('10/09/26', '09/09/26')).toEqual({
      ok: false,
      error: 'La fecha de fin no puede ser anterior a la de inicio.',
    });
  });

  it('filtra los movimientos del rango elegido, bordes incluidos', () => {
    const at = (d: Date) => d.toISOString();
    const movements = [
      { id: 1, createdAt: at(new Date(2026, 7, 31, 23, 59)) },
      { id: 2, createdAt: at(new Date(2026, 8, 1, 0, 0)) },
      { id: 3, createdAt: at(new Date(2026, 8, 15, 23, 59)) },
      { id: 4, createdAt: at(new Date(2026, 8, 16, 0, 0)) },
    ].map((m) => ({
      type: 'gasto',
      amount: 1,
      category: 'Comida',
      description: 'x',
      rawText: 'x',
      sourceFundId: 1,
      destinationFundId: null,
      ...m,
    })) as Movement[];

    const result = buildPeriodFromInput('01/09/26', '15/09/26');
    if (!result.ok) throw new Error(result.error);
    const filtered = filterMovements(movements, {
      searchQuery: '',
      filterType: null,
      filterCategory: null,
      filterPeriod: result.period,
    });
    expect(filtered.map((m) => m.id)).toEqual([2, 3]);
  });
});

describe('formato del período', () => {
  it('muestra dd/mm/aa y el último día incluido', () => {
    expect(formatDayMonthYear(new Date(2026, 0, 5).toISOString())).toBe('05/01/26');
    const result = buildPeriodFromInput('01/09/26', '15/09/26');
    if (!result.ok) throw new Error(result.error);
    expect(describePeriod(result.period)).toBe('01/09/26 – 15/09/26');
  });
});
