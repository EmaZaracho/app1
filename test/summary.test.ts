import { createFund, getFunds, setBudget } from '../src/db/database';
import { addMovement } from '../src/db/movementsRepo';
import { getBudgetAlerts } from '../src/db/budgetsRepo';
import {
  getExpenseCategoryTotals,
  getMonthlyTrend,
} from '../src/db/summaryRepo';
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
});
