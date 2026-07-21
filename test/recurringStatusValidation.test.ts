import { computeEffectiveStatus } from '../src/recurring/recurringStatus';
import { validateRecurringRule } from '../src/recurring/recurringValidation';
import type { RecurringRuleInput } from '../src/types/recurringExpenses';

function baseRule(overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput {
  return {
    name: 'Internet',
    description: null,
    category: 'Servicios',
    amountMode: 'fixed',
    amount: 25000,
    fundAssignmentMode: 'ask_on_payment',
    fundId: null,
    dayOfMonth: 10,
    startDate: '2026-08-01',
    endDate: null,
    isActive: true,
    ...overrides,
  };
}

describe('estado efectivo (overdue derivado)', () => {
  it('pending futuro sigue pending', () => {
    expect(computeEffectiveStatus('pending', '2026-08-20', '2026-08-10')).toBe('pending');
  });
  it('pending con fecha pasada es overdue', () => {
    expect(computeEffectiveStatus('pending', '2026-08-05', '2026-08-10')).toBe('overdue');
  });
  it('paid/skipped/cancelled no derivan a overdue', () => {
    expect(computeEffectiveStatus('paid', '2026-08-05', '2026-08-10')).toBe('paid');
    expect(computeEffectiveStatus('skipped', '2026-08-05', '2026-08-10')).toBe('skipped');
    expect(computeEffectiveStatus('cancelled', '2026-08-05', '2026-08-10')).toBe('cancelled');
  });
});

describe('validación de reglas', () => {
  it('regla fija válida', () => {
    expect(validateRecurringRule(baseRule())).toBeNull();
  });
  it('fija sin monto es inválida', () => {
    expect(validateRecurringRule(baseRule({ amountMode: 'fixed', amount: null }))).toBeTruthy();
  });
  it('estimada requiere monto > 0', () => {
    expect(validateRecurringRule(baseRule({ amountMode: 'estimated', amount: 0 }))).toBeTruthy();
    expect(validateRecurringRule(baseRule({ amountMode: 'estimated', amount: 3000 }))).toBeNull();
  });
  it('unknown debe tener monto null', () => {
    expect(validateRecurringRule(baseRule({ amountMode: 'unknown', amount: 100 }))).toBeTruthy();
    expect(validateRecurringRule(baseRule({ amountMode: 'unknown', amount: null }))).toBeNull();
  });
  it('fondo fijo requiere fundId; ask_on_payment lo prohíbe', () => {
    expect(validateRecurringRule(baseRule({ fundAssignmentMode: 'fixed', fundId: null }))).toBeTruthy();
    expect(validateRecurringRule(baseRule({ fundAssignmentMode: 'fixed', fundId: 1 }))).toBeNull();
    expect(validateRecurringRule(baseRule({ fundAssignmentMode: 'ask_on_payment', fundId: 5 }))).toBeTruthy();
  });
  it('día fuera de 1..31 es inválido', () => {
    expect(validateRecurringRule(baseRule({ dayOfMonth: 0 }))).toBeTruthy();
    expect(validateRecurringRule(baseRule({ dayOfMonth: 32 }))).toBeTruthy();
  });
  it('end_date anterior a start_date es inválida', () => {
    expect(validateRecurringRule(baseRule({ startDate: '2026-08-01', endDate: '2026-07-01' }))).toBeTruthy();
    expect(validateRecurringRule(baseRule({ startDate: '2026-08-01', endDate: '2026-12-01' }))).toBeNull();
  });
});
