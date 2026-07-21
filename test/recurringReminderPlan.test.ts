import { buildReminderPlan, REMINDER_HOUR } from '../src/recurring/recurringReminderPlan';
import type { ReminderOccurrenceInput } from '../src/recurring/recurringReminderPlan';

function occ(overrides: Partial<ReminderOccurrenceInput> = {}): ReminderOccurrenceInput {
  return {
    occurrenceId: 1,
    ruleName: 'Internet',
    scheduledDate: '2026-08-20',
    projectedAmount: 25000,
    storedStatus: 'pending',
    ...overrides,
  };
}

describe('plan de recordatorios', () => {
  it('programa 3 días antes y el mismo día, ambos a las 09:00 locales', () => {
    const now = new Date(2026, 7, 1, 12, 0, 0); // 1 ago
    const plan = buildReminderPlan([occ()], now);
    expect(plan).toHaveLength(2);
    const threeDay = plan.find((p) => p.identifier === 'rec-1-3d')!;
    const sameDay = plan.find((p) => p.identifier === 'rec-1-day')!;
    expect(threeDay.fireDate.getHours()).toBe(REMINDER_HOUR);
    expect(sameDay.fireDate.getHours()).toBe(REMINDER_HOUR);
    // 3 días antes del 20 = 17
    expect(threeDay.fireDate.getDate()).toBe(17);
    expect(sameDay.fireDate.getDate()).toBe(20);
  });

  it('si la de 3 días antes ya pasó, solo programa la del día', () => {
    const now = new Date(2026, 7, 18, 12, 0, 0); // 18 ago, ya pasó el 17
    const plan = buildReminderPlan([occ()], now);
    expect(plan.map((p) => p.identifier)).toEqual(['rec-1-day']);
  });

  it('si ambas fechas pasaron, no programa nada', () => {
    const now = new Date(2026, 7, 21, 12, 0, 0); // 21 ago
    expect(buildReminderPlan([occ()], now)).toHaveLength(0);
  });

  it('solo programa ocurrencias pending (no paid/skipped/cancelled)', () => {
    const now = new Date(2026, 7, 1, 12, 0, 0);
    expect(buildReminderPlan([occ({ storedStatus: 'paid' })], now)).toHaveLength(0);
    expect(buildReminderPlan([occ({ storedStatus: 'skipped' })], now)).toHaveLength(0);
    expect(buildReminderPlan([occ({ storedStatus: 'cancelled' })], now)).toHaveLength(0);
  });

  it('usa la fecha efectiva ajustada (día 31 en febrero) sin desplazar por fin de semana', () => {
    // El generador ya ajusta la fecha; acá verificamos que el plan respeta la fecha dada.
    const now = new Date(2028, 1, 1, 12, 0, 0);
    const plan = buildReminderPlan([occ({ scheduledDate: '2028-02-29' })], now);
    const sameDay = plan.find((p) => p.identifier === 'rec-1-day')!;
    expect(sameDay.fireDate.getMonth()).toBe(1);
    expect(sameDay.fireDate.getDate()).toBe(29);
  });

  it('el cuerpo indica importe desconocido cuando corresponde', () => {
    const now = new Date(2026, 7, 1, 12, 0, 0);
    const plan = buildReminderPlan([occ({ projectedAmount: null })], now);
    expect(plan[0].body).toMatch(/desconocid/i);
  });
});
