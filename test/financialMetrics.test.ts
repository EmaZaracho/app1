import { createFund, getFunds } from '../src/db/fundsRepo';
import { addMovement } from '../src/db/movementsRepo';
import {
  getPeriodActiveDays,
  getPeriodActivity,
  getPeriodExpenseCategoryTotals,
  getPeriodFinancials,
} from '../src/analytics/financialMetrics';
import { freshDb } from './helpers';

const RANGE = { start: new Date(2026, 6, 1).toISOString(), end: new Date(2026, 7, 1).toISOString() };
const OUTSIDE_DATE = new Date(2026, 5, 15).toISOString();

async function seedMovement(db: any, efectivo: number, opts: any) {
  return addMovement(db, {
    type: opts.type,
    amount: opts.amount,
    category: opts.category ?? null,
    description: 'x',
    rawText: 'x',
    sourceFundId: opts.sourceFundId ?? null,
    destinationFundId: opts.destinationFundId ?? null,
  });
}

describe('métricas financieras del período', () => {
  it('ingresos/gastos solo consideran type=ingreso/gasto; transferencias y ajustes se excluyen del ahorro operativo', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const banco = await createFund(db, { name: 'Banco' });

    await seedMovement(db, efectivo, { type: 'ingreso', amount: 10000, category: 'Sueldo', destinationFundId: efectivo });
    await seedMovement(db, efectivo, { type: 'gasto', amount: 3000, category: 'Comida', sourceFundId: efectivo });
    await seedMovement(db, efectivo, { type: 'transferencia', amount: 2000, sourceFundId: efectivo, destinationFundId: banco });
    await seedMovement(db, efectivo, { type: 'ajuste', amount: 500, destinationFundId: banco });

    const financials = await getPeriodFinancials(db, RANGE);
    expect(financials.income).toBe(10000);
    expect(financials.expense).toBe(3000);
    expect(financials.operationalSavings).toBe(7000); // no incluye transferencia ni ajuste
    expect(financials.adjustmentsNet).toBe(500);
  });

  it('sin ingresos, savingsRate es null (no 0 artificial)', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await seedMovement(db, efectivo, { type: 'gasto', amount: 100, category: 'Comida', sourceFundId: efectivo });
    const financials = await getPeriodFinancials(db, RANGE);
    expect(financials.income).toBe(0);
    expect(financials.savingsRate).toBeNull();
  });

  it('respeta el rango: movimientos fuera del período no se cuentan', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await addMovement(db, {
      type: 'gasto',
      amount: 999,
      category: 'Comida',
      description: 'x',
      rawText: 'x',
      sourceFundId: efectivo,
      destinationFundId: null,
    });
    // Forzamos la fecha fuera de rango directamente para simular un movimiento histórico.
    await db.runAsync('UPDATE movements SET created_at = ? WHERE amount = 999', [OUTSIDE_DATE]);
    const financials = await getPeriodFinancials(db, RANGE);
    expect(financials.expense).toBe(0);
  });

  it('gastos por categoría del período: solo gasto, agrupado', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await seedMovement(db, efectivo, { type: 'gasto', amount: 100, category: 'Comida', sourceFundId: efectivo });
    await seedMovement(db, efectivo, { type: 'gasto', amount: 200, category: 'Comida', sourceFundId: efectivo });
    await seedMovement(db, efectivo, { type: 'gasto', amount: 50, category: 'Transporte', sourceFundId: efectivo });
    await seedMovement(db, efectivo, { type: 'ingreso', amount: 9999, category: 'Sueldo', destinationFundId: efectivo });

    const totals = await getPeriodExpenseCategoryTotals(db, RANGE);
    const comida = totals.find((t) => t.category === 'Comida');
    expect(comida?.amount).toBe(300);
    // Solo las 2 categorías de gasto deben aparecer; el ingreso ("Sueldo") queda afuera.
    expect(totals).toHaveLength(2);
  });

  it('actividad: cuenta solo gasto+ingreso (las transferencias no inflan la muestra)', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const banco = await createFund(db, { name: 'Banco' });
    await seedMovement(db, efectivo, { type: 'gasto', amount: 100, category: 'Comida', sourceFundId: efectivo });
    await seedMovement(db, efectivo, { type: 'ingreso', amount: 500, category: 'Sueldo', destinationFundId: efectivo });
    await seedMovement(db, efectivo, { type: 'transferencia', amount: 50, sourceFundId: efectivo, destinationFundId: banco });

    const activity = await getPeriodActivity(db, RANGE);
    expect(activity.movementCount).toBe(2);
    expect(activity.expenseCount).toBe(1);
    expect(activity.incomeCount).toBe(1);
  });

  it('días activos: cuenta días calendario distintos con gasto/ingreso', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const m1 = await seedMovement(db, efectivo, { type: 'gasto', amount: 10, category: 'Comida', sourceFundId: efectivo });
    const m2 = await seedMovement(db, efectivo, { type: 'gasto', amount: 20, category: 'Comida', sourceFundId: efectivo });
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 5).toISOString(), m1.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 6, 5).toISOString(), m2.id]);
    expect(await getPeriodActiveDays(db, RANGE)).toBe(1);
  });
});
