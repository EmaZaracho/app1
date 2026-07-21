import { insertRule } from '../src/db/recurringExpenseRulesRepository';
import {
  getOccurrencesForMonth,
  setOccurrenceStatus,
} from '../src/db/recurringExpenseOccurrencesRepository';
import { ensureOccurrencesForMonth } from '../src/recurring/recurringOccurrenceGenerator';
import { registerOccurrencePayment } from '../src/recurring/recurringPayment';
import {
  getBudgetProjections,
  getFundProjections,
  getMonthlyProjection,
} from '../src/db/recurringExpenseQueries';
import { setBudget } from '../src/db/budgetsRepo';
import { getCurrentMonthExpenseCategoryTotals } from '../src/db/summaryRepo';
import { addMovement } from '../src/db/movementsRepo';
import type { RecurringRuleInput } from '../src/types/recurringExpenses';
import { freshDb } from './helpers';
import { toMonthKey } from '../src/recurring/recurringDateUtils';

const NOW = new Date();
const CURRENT_MONTH = toMonthKey(NOW);

async function fundId(db: any): Promise<number> {
  const funds = await db.getAllAsync('SELECT id FROM funds');
  return funds[0].id;
}

function rule(fid: number, overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput {
  return {
    name: 'Internet',
    description: null,
    category: 'Servicios',
    amountMode: 'fixed',
    amount: 20000,
    fundAssignmentMode: 'fixed',
    fundId: fid,
    dayOfMonth: 10,
    startDate: '2020-01-01',
    endDate: null,
    isActive: true,
    ...overrides,
  };
}

describe('proyecciones (integración DB)', () => {
  it('la proyección pendiente no altera el gasto real ni las estadísticas reales', async () => {
    const db = await freshDb();
    const fid = await fundId(db);
    await insertRule(db, rule(fid));
    await ensureOccurrencesForMonth(db, NOW.getFullYear(), NOW.getMonth());

    // Gasto real efectivo (no recurrente) para tener base.
    await addMovement(db, {
      type: 'gasto',
      amount: 5000,
      category: 'Comida',
      description: 'x',
      rawText: 'x',
      sourceFundId: fid,
      destinationFundId: null,
    });

    const realTotals = await getCurrentMonthExpenseCategoryTotals(db);
    const servicios = realTotals.find((t) => t.category === 'Servicios');
    // La ocurrencia pendiente NO cuenta como gasto real de Servicios.
    expect(servicios).toBeUndefined();

    const summary = await getMonthlyProjection(db, CURRENT_MONTH, NOW);
    expect(summary.pendingProjectedKnownTotal).toBe(20000);
    expect(summary.paidActualTotal).toBe(0);
  });

  it('saldo proyectado por fondo resta solo gastos con fondo fijo', async () => {
    const db = await freshDb();
    const fid = await fundId(db);
    // Saldo inicial del fondo.
    await addMovement(db, {
      type: 'ajuste',
      amount: 100000,
      category: null,
      description: 'saldo',
      rawText: 'saldo',
      sourceFundId: null,
      destinationFundId: fid,
    });
    await insertRule(db, rule(fid, { amount: 30000 }));
    await ensureOccurrencesForMonth(db, NOW.getFullYear(), NOW.getMonth());

    const projections = await getFundProjections(db, CURRENT_MONTH, NOW);
    const p = projections.find((x) => x.fundId === fid)!;
    expect(p.realBalance).toBe(100000);
    expect(p.pendingKnownExpenses).toBe(30000);
    expect(p.projectedBalance).toBe(70000);
  });

  it('un gasto ask_on_payment no se atribuye a ningún fondo proyectado', async () => {
    const db = await freshDb();
    const fid = await fundId(db);
    await addMovement(db, {
      type: 'ajuste',
      amount: 50000,
      category: null,
      description: 'saldo',
      rawText: 'saldo',
      sourceFundId: null,
      destinationFundId: fid,
    });
    await insertRule(db, rule(fid, { fundAssignmentMode: 'ask_on_payment', fundId: null, amount: 30000 }));
    await ensureOccurrencesForMonth(db, NOW.getFullYear(), NOW.getMonth());

    const projections = await getFundProjections(db, CURRENT_MONTH, NOW);
    const p = projections.find((x) => x.fundId === fid)!;
    expect(p.pendingKnownExpenses).toBe(0); // no se atribuye
    expect(p.projectedBalance).toBe(50000);
  });

  it('presupuesto proyectado advierte sin activar alerta real', async () => {
    const db = await freshDb();
    const fid = await fundId(db);
    await setBudget(db, 'Servicios', 25000);
    // gasto real de 10000 en Servicios
    await addMovement(db, {
      type: 'gasto',
      amount: 10000,
      category: 'Servicios',
      description: 'x',
      rawText: 'x',
      sourceFundId: fid,
      destinationFundId: null,
    });
    await insertRule(db, rule(fid, { amount: 20000 })); // proyectado 20000
    await ensureOccurrencesForMonth(db, NOW.getFullYear(), NOW.getMonth());

    const projections = await getBudgetProjections(db, CURRENT_MONTH, NOW);
    const servicios = projections.find((p) => p.category === 'Servicios')!;
    expect(servicios.spent).toBe(10000);
    expect(servicios.projectedPending).toBe(20000);
    expect(servicios.possibleTotal).toBe(30000);
    expect(servicios.projectedOverBy).toBe(5000); // 30000 - 25000
  });

  it('una ocurrencia pagada usa el monto real en el total pagado', async () => {
    const db = await freshDb();
    const fid = await fundId(db);
    await insertRule(db, rule(fid, { amount: 20000 }));
    await ensureOccurrencesForMonth(db, NOW.getFullYear(), NOW.getMonth());
    const [occ] = await getOccurrencesForMonth(db, CURRENT_MONTH, NOW);
    await registerOccurrencePayment(db, {
      occurrenceId: occ.id,
      amount: 23500,
      category: 'Servicios',
      description: 'Internet',
      fundId: fid,
    });
    const summary = await getMonthlyProjection(db, CURRENT_MONTH, NOW);
    expect(summary.paidActualTotal).toBe(23500);
    expect(summary.pendingProjectedKnownTotal).toBe(0);
  });
});
