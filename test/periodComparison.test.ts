import { resolvePeriod } from '../src/analytics/periodRanges';
import { previousEquivalentRange, previousThreeEquivalentRanges } from '../src/analytics/periodComparison';

const NOW = new Date(2026, 6, 15, 10, 0, 0);

describe('comparación de períodos', () => {
  it('current_month: el anterior equivalente es el mes calendario previo (misma duración/estrategia)', () => {
    const period = resolvePeriod('current_month', NOW);
    const prev = previousEquivalentRange(period);
    expect(new Date(prev.start)).toEqual(new Date(2026, 5, 1));
    expect(new Date(prev.end)).toEqual(new Date(2026, 6, 1));
  });

  it('last_30_days: el anterior equivalente son los 30 días inmediatamente anteriores (duración exacta)', () => {
    const period = resolvePeriod('last_30_days', NOW);
    const prev = previousEquivalentRange(period);
    expect(prev.end).toBe(period.start);
    const ms = new Date(prev.end).getTime() - new Date(prev.start).getTime();
    expect(Math.round(ms / 86400000)).toBe(30);
  });

  it('período personalizado de 12 días: el anterior equivalente son los 12 días previos', () => {
    const period = resolvePeriod('custom', NOW, { start: new Date(2026, 6, 1), end: new Date(2026, 6, 12) });
    expect(period.days).toBe(12);
    const prev = previousEquivalentRange(period);
    expect(prev.end).toBe(period.start);
    const ms = new Date(prev.end).getTime() - new Date(prev.start).getTime();
    expect(Math.round(ms / 86400000)).toBe(12);
  });

  it('promedio de 3 períodos: son 3 bloques consecutivos hacia atrás sin solaparse', () => {
    const period = resolvePeriod('current_month', NOW); // julio 2026
    const [b1, b2, b3] = previousThreeEquivalentRanges(period);
    expect(new Date(b1.start)).toEqual(new Date(2026, 5, 1)); // junio
    expect(new Date(b1.end)).toEqual(new Date(2026, 6, 1));
    expect(new Date(b2.start)).toEqual(new Date(2026, 4, 1)); // mayo
    expect(new Date(b2.end)).toEqual(new Date(2026, 5, 1));
    expect(new Date(b3.start)).toEqual(new Date(2026, 3, 1)); // abril
    expect(new Date(b3.end)).toEqual(new Date(2026, 4, 1));
  });

  it('no compara períodos de distinta duración: last_3_months usa estrategia de meses, no de días', () => {
    const period = resolvePeriod('last_3_months', NOW);
    const prev = previousEquivalentRange(period);
    // Se desplaza 3 meses calendario, no `period.days` días exactos.
    expect(new Date(prev.start)).toEqual(new Date(2026, 1, 1)); // febrero (mayo - 3)
  });
});
