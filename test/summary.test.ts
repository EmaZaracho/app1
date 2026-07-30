import { createFund, getFunds, setBudget } from '../src/db/database';
import { addMovement } from '../src/db/movementsRepo';
import { getBudgetAlerts } from '../src/db/budgetsRepo';
import {
  getExpenseCategoryTotals,
  getMonthlyTrend,
} from '../src/db/summaryRepo';
import { getTotalStats } from '../src/db/balances';
import { freshDb } from './helpers';

describe('consultas globales (resúmenes y presupuestos)', () => {
  it('transferencias y ajustes no cuentan como gasto por categoría', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const banco = await createFund(db, { name: 'Banco' });
    await addMovement(db, { type: 'gasto', amount: 100, category: 'Comida', description: 'x', rawText: 'x', sourceFundId: efectivo, destinationFundId: null });
    await addMovement(db, { type: 'transferencia', amount: 500, category: null, description: 't', rawText: 't', sourceFundId: efectivo, destinationFundId: banco });
    await addMovement(db, { type: 'ajuste', amount: 999, category: null, description: 'a', rawText: 'a', sourceFundId: null, destinationFundId: banco });

    const totals = await getExpenseCategoryTotals(db);
    const comida = totals.find((t) => t.category === 'Comida');
    expect(comida?.total).toBe(100);
    // sólo debe existir la categoría del gasto real
    expect(totals).toHaveLength(1);
  });

  it('una transferencia nunca dispara alertas de presupuesto', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const banco = await createFund(db, { name: 'Banco' });
    await setBudget(db, 'Comida', 50);
    // gasto real por debajo del límite
    await addMovement(db, { type: 'gasto', amount: 40, category: 'Comida', description: 'x', rawText: 'x', sourceFundId: efectivo, destinationFundId: null });
    // transferencia grande no debe contar
    await addMovement(db, { type: 'transferencia', amount: 1000, category: null, description: 't', rawText: 't', sourceFundId: efectivo, destinationFundId: banco });

    const alerts = await getBudgetAlerts(db);
    expect(alerts).toHaveLength(0);
  });

  it('la línea base excluye gastos anteriores de las alertas de presupuesto', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await setBudget(db, 'Comida', 50);
    const priorExpense = await addMovement(db, {
      type: 'gasto', amount: 100, category: 'Comida', description: 'previo', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    const trackedExpense = await addMovement(db, {
      type: 'gasto', amount: 40, category: 'Comida', description: 'nuevo', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    const baseline = new Date(2026, 6, 10).toISOString();
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 2).toISOString(), priorExpense.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 12).toISOString(), trackedExpense.id]);

    expect(await getBudgetAlerts(db, baseline)).toHaveLength(0);
  });

  it('las tendencias no tratan transferencias como gastos', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const banco = await createFund(db, { name: 'Banco' });
    await addMovement(db, { type: 'ingreso', amount: 1000, category: 'Sueldo', description: 'x', rawText: 'x', sourceFundId: null, destinationFundId: efectivo });
    await addMovement(db, { type: 'transferencia', amount: 700, category: null, description: 't', rawText: 't', sourceFundId: efectivo, destinationFundId: banco });

    const trend = await getMonthlyTrend(db, 6);
    const current = trend[trend.length - 1];
    expect(current.income).toBe(1000);
    expect(current.expense).toBe(0); // la transferencia no es gasto
  });

  it('la línea base limita resúmenes y estadísticas de flujo, pero no el saldo', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const oldIncome = await addMovement(db, {
      type: 'ingreso', amount: 1000, category: 'Sueldo', description: 'ingreso previo', rawText: 'x', sourceFundId: null, destinationFundId: efectivo,
    });
    const newExpense = await addMovement(db, {
      type: 'gasto', amount: 200, category: 'Comida', description: 'gasto nuevo', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    const baseline = new Date(2026, 6, 10).toISOString();
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 2).toISOString(), oldIncome.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 12).toISOString(), newExpense.id]);

    expect(await getExpenseCategoryTotals(db, baseline)).toEqual([{ category: 'Comida', total: 200 }]);
    const stats = await getTotalStats(db, baseline);
    expect(stats.balance).toBe(800);
    expect(stats.income).toBe(0);
    expect(stats.expense).toBe(200);
    expect(stats.monthlyVariation).toBe(-200);
  });
});
