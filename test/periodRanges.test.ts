import { resolvePeriod } from '../src/analytics/periodRanges';

// Fecha de referencia fija para que los tests sean determinísticos: 15 de julio de 2026 (miércoles).
const NOW = new Date(2026, 6, 15, 10, 30, 0);

describe('rangos de periodo (zona horaria local)', () => {
  it('este mes: límites exactos del mes calendario, end exclusivo', () => {
    const p = resolvePeriod('current_month', NOW);
    expect(new Date(p.start)).toEqual(new Date(2026, 6, 1));
    expect(new Date(p.end)).toEqual(new Date(2026, 7, 1));
    expect(p.days).toBe(31);
  });

  it('mes anterior', () => {
    const p = resolvePeriod('previous_month', NOW);
    expect(new Date(p.start)).toEqual(new Date(2026, 5, 1));
    expect(new Date(p.end)).toEqual(new Date(2026, 6, 1));
    expect(p.days).toBe(30);
  });

  it('últimos 30 días: ventana móvil terminando hoy inclusive', () => {
    const p = resolvePeriod('last_30_days', NOW);
    expect(new Date(p.end)).toEqual(new Date(2026, 6, 16)); // mañana 00:00 (exclusivo) = incluye hoy completo
    expect(p.days).toBe(30);
  });

  it('últimos 3 / 6 meses: desde el 1° del mes N-1 atrás hasta hoy inclusive', () => {
    const p3 = resolvePeriod('last_3_months', NOW);
    expect(new Date(p3.start)).toEqual(new Date(2026, 4, 1)); // mayo
    expect(new Date(p3.end)).toEqual(new Date(2026, 6, 16));

    const p6 = resolvePeriod('last_6_months', NOW);
    expect(new Date(p6.start)).toEqual(new Date(2026, 1, 1)); // febrero
  });

  it('personalizado: end del usuario es inclusivo y se normaliza a exclusivo', () => {
    const p = resolvePeriod('custom', NOW, {
      start: new Date(2026, 6, 1),
      end: new Date(2026, 6, 10),
    });
    expect(new Date(p.start)).toEqual(new Date(2026, 6, 1));
    expect(new Date(p.end)).toEqual(new Date(2026, 6, 11)); // día siguiente al 10
    expect(p.days).toBe(10);
  });

  it('personalizado con start posterior a end lanza error', () => {
    expect(() =>
      resolvePeriod('custom', NOW, { start: new Date(2026, 6, 10), end: new Date(2026, 6, 1) })
    ).toThrow();
  });

  it('personalizado sin fechas lanza error', () => {
    expect(() => resolvePeriod('custom', NOW)).toThrow();
  });

  it('respeta la zona horaria local: los límites son medianoche local, no UTC', () => {
    const p = resolvePeriod('current_month', NOW);
    const start = new Date(p.start);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });
});
