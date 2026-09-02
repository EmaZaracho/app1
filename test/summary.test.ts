import { createFund, getFunds, setBudget } from '../src/db/database';
import { addMovement } from '../src/db/movementsRepo';
import { getBudgetAlerts } from '../src/db/budgetsRepo';
import {
  getExpenseCategoryTotals,
  getExpenseCategoryTotalsForMonth,
  getMonthlyTrend,
  isFutureMonthKey,
  sumMonthlyTrend,
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
    const now = new Date(2026, 6, 20);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 2).toISOString(), oldIncome.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 12).toISOString(), newExpense.id]);

    expect(await getExpenseCategoryTotals(db, baseline)).toEqual([{ category: 'Comida', total: 200 }]);
    const stats = await getTotalStats(db, baseline, now);
    expect(stats.balance).toBe(800);
    expect(stats.income).toBe(0);
    expect(stats.expense).toBe(200);
    expect(stats.monthlyVariation).toBe(-200);
  });

  it('los ingresos y gastos del carrusel son solo del mes en curso, aunque el saldo sea histórico', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const julyIncome = await addMovement(db, {
      type: 'ingreso', amount: 1000, category: 'Sueldo', description: 'ingreso de julio', rawText: 'x', sourceFundId: null, destinationFundId: efectivo,
    });
    const augustExpense = await addMovement(db, {
      type: 'gasto', amount: 200, category: 'Comida', description: 'gasto de agosto', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    const baseline = new Date(2026, 6, 1).toISOString(); // 1 de julio de 2026
    const now = new Date(2026, 7, 20); // 20 de agosto de 2026: mes en curso
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 15).toISOString(), julyIncome.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 7, 5).toISOString(), augustExpense.id]);

    const stats = await getTotalStats(db, baseline, now);
    expect(stats.balance).toBe(800); // saldo histórico: incluye el ingreso de julio
    expect(stats.income).toBe(0); // el ingreso de julio no es del mes en curso
    expect(stats.expense).toBe(200); // el gasto de agosto sí es del mes en curso
    expect(stats.monthlyVariation).toBe(-200);
  });

  it('el rango "Todo" incluye todos los meses desde el primer movimiento elegible, respetando trackingStart', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const now = new Date(2027, 0, 15); // 15 de enero de 2027

    const beforeBaseline = await addMovement(db, {
      type: 'ingreso', amount: 999, category: 'Sueldo', description: 'anterior a la línea base', rawText: 'x', sourceFundId: null, destinationFundId: efectivo,
    });
    const novemberIncome = await addMovement(db, {
      type: 'ingreso', amount: 500, category: 'Sueldo', description: 'noviembre', rawText: 'x', sourceFundId: null, destinationFundId: efectivo,
    });
    const januaryExpense = await addMovement(db, {
      type: 'gasto', amount: 300, category: 'Comida', description: 'enero', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    const trackingStart = new Date(2026, 10, 1).toISOString(); // 1 de noviembre de 2026
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 9, 5).toISOString(), beforeBaseline.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 10, 5).toISOString(), novemberIncome.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2027, 0, 10).toISOString(), januaryExpense.id]);

    const trend = await getMonthlyTrend(db, 'all', trackingStart, now);
    // noviembre (primer movimiento elegible) a enero (mes en curso), incluyendo diciembre vacío
    expect(trend.map((p) => p.monthKey)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(trend[0]).toMatchObject({ income: 500, expense: 0 });
    expect(trend[1]).toMatchObject({ income: 0, expense: 0 });
    expect(trend[2]).toMatchObject({ income: 0, expense: 300 });

    expect(sumMonthlyTrend(trend)).toEqual({ income: 500, expense: 300, balance: 200 });
  });

  it('getExpenseCategoryTotalsForMonth solo incluye gastos del mes elegido, excluyendo otros meses', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;

    const augustExpense = await addMovement(db, {
      type: 'gasto', amount: 150, category: 'Comida', description: 'agosto', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    const julyExpense = await addMovement(db, {
      type: 'gasto', amount: 999, category: 'Comida', description: 'julio', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    const septemberExpense = await addMovement(db, {
      type: 'gasto', amount: 777, category: 'Comida', description: 'septiembre', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 7, 10).toISOString(), augustExpense.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 20).toISOString(), julyExpense.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 8, 1).toISOString(), septemberExpense.id]);

    const totals = await getExpenseCategoryTotalsForMonth(db, '2026-08');
    expect(totals).toEqual([{ category: 'Comida', total: 150 }]);
  });

  it('getExpenseCategoryTotalsForMonth respeta trackingStart dentro del mes elegido', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;

    const beforeTracking = await addMovement(db, {
      type: 'gasto', amount: 300, category: 'Comida', description: 'antes de la línea base', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    const afterTracking = await addMovement(db, {
      type: 'gasto', amount: 80, category: 'Comida', description: 'después de la línea base', rawText: 'x', sourceFundId: efectivo, destinationFundId: null,
    });
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 7, 3).toISOString(), beforeTracking.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 7, 20).toISOString(), afterTracking.id]);
    const trackingStart = new Date(2026, 7, 10).toISOString(); // 10 de agosto de 2026

    const totals = await getExpenseCategoryTotalsForMonth(db, '2026-08', trackingStart);
    expect(totals).toEqual([{ category: 'Comida', total: 80 }]);
  });

  it('isFutureMonthKey rechaza un mes posterior al actual y acepta el mes actual', () => {
    const now = new Date(2026, 7, 15); // 15 de agosto de 2026
    expect(isFutureMonthKey('2026-09', now)).toBe(true);
    expect(isFutureMonthKey('2026-08', now)).toBe(false);
    expect(isFutureMonthKey('2026-07', now)).toBe(false);
  });
});
