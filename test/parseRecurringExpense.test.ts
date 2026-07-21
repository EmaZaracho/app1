import { parseRecurringExpenseResponse } from '../src/services/parseRecurringExpenseResponse';
import { AIProviderError } from '../src/services/aiErrors';
import type { FundMatchTarget } from '../src/domain/fundMatching';

const NOW = new Date(2026, 7, 1, 12, 0, 0);
const TARGETS: FundMatchTarget[] = [
  { id: 1, name: 'Mercado Pago', normalizedName: 'mercado pago', aliases: [{ normalizedAlias: 'mp' }] },
  { id: 2, name: 'Ualá', normalizedName: 'uala', aliases: [] },
];

function res(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'recurring_expense',
    name: 'Internet',
    description: null,
    category: 'Servicios',
    amountMode: 'estimated',
    amount: 25000,
    fundAssignmentMode: 'fixed',
    fund: 'Mercado Pago',
    dayOfMonth: 10,
    startDate: null,
    endDate: null,
    ...overrides,
  });
}

describe('parseRecurringExpenseResponse', () => {
  it('respuesta válida resuelve el fondo por nombre', () => {
    const draft = parseRecurringExpenseResponse(res(), TARGETS, NOW);
    expect(draft.name).toBe('Internet');
    expect(draft.fundAssignmentMode).toBe('fixed');
    expect(draft.fundId).toBe(1);
    expect(draft.amountMode).toBe('estimated');
    expect(draft.amount).toBe(25000);
  });

  it('resuelve el fondo por alias (MP)', () => {
    const draft = parseRecurringExpenseResponse(res({ fund: 'mp' }), TARGETS, NOW);
    expect(draft.fundId).toBe(1);
  });

  it('JSON inválido lanza AIProviderError', () => {
    expect(() => parseRecurringExpenseResponse('no json', TARGETS, NOW)).toThrow(AIProviderError);
  });

  it('rechaza kind distinto de recurring_expense (ej. un ingreso)', () => {
    expect(() => parseRecurringExpenseResponse(res({ kind: 'income' }), TARGETS, NOW)).toThrow(AIProviderError);
  });

  it('día inválido (0) se rechaza: no es un gasto mensual', () => {
    expect(() => parseRecurringExpenseResponse(res({ dayOfMonth: 0 }), TARGETS, NOW)).toThrow(AIProviderError);
  });

  it('monto faltante en fixed degrada a unknown', () => {
    const draft = parseRecurringExpenseResponse(res({ amountMode: 'fixed', amount: null }), TARGETS, NOW);
    expect(draft.amountMode).toBe('unknown');
    expect(draft.amount).toBeNull();
  });

  it('fondo inexistente no se inventa: cae a ask_on_payment y marca unresolved', () => {
    const draft = parseRecurringExpenseResponse(res({ fund: 'Banco Galicia' }), TARGETS, NOW);
    expect(draft.fundAssignmentMode).toBe('ask_on_payment');
    expect(draft.fundId).toBeNull();
    expect(draft.fundUnresolved).toBe(true);
  });

  it('categoría inválida cae a Otros', () => {
    const draft = parseRecurringExpenseResponse(res({ category: 'Inventada' }), TARGETS, NOW);
    expect(draft.category).toBe('Otros');
  });

  it('sin startDate usa la fecha local de hoy', () => {
    const draft = parseRecurringExpenseResponse(res({ startDate: null }), TARGETS, NOW);
    expect(draft.startDate).toBe('2026-08-01');
  });
});
