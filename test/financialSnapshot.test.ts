import { archiveFund, createFund, getFunds } from '../src/db/fundsRepo';
import { addMovement } from '../src/db/movementsRepo';
import { setBudget } from '../src/db/budgetsRepo';
import { setCategoryPriority, getCategoryPriorities } from '../src/db/categoryFinancialSettingsRepository';
import { setSavingsGoal } from '../src/db/financialPreferencesRepository';
import { buildFinancialSnapshot } from '../src/analytics/financialSnapshot';
import { freshDb } from './helpers';

const NOW = new Date(2026, 6, 20, 12, 0, 0); // 20 de julio de 2026

async function gasto(db: any, fundId: number, amount: number, category: string, at: Date) {
  const m = await addMovement(db, {
    type: 'gasto',
    amount,
    category: category as any,
    description: 'x',
    rawText: 'x',
    sourceFundId: fundId,
    destinationFundId: null,
  });
  await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [at.toISOString(), m.id]);
}

async function ingreso(db: any, fundId: number, amount: number, at: Date) {
  const m = await addMovement(db, {
    type: 'ingreso',
    amount,
    category: 'Sueldo',
    description: 'x',
    rawText: 'x',
    sourceFundId: null,
    destinationFundId: fundId,
  });
  await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [at.toISOString(), m.id]);
}

describe('FinancialSnapshot (integración)', () => {
  it('prioridades de categoría: usa el default la primera vez, respeta lo editado después', async () => {
    const db = await freshDb();
    const priorities = await getCategoryPriorities(db);
    expect(priorities.find((p) => p.category === 'Vivienda')?.priority).toBe('essential');
    expect(priorities.find((p) => p.category === 'Comida')?.priority).toBe('flexible');
    expect(priorities.find((p) => p.category === 'Compras')?.priority).toBe('discretionary');

    await setCategoryPriority(db, 'Comida', 'discretionary');
    const updated = await getCategoryPriorities(db);
    expect(updated.find((p) => p.category === 'Comida')?.priority).toBe('discretionary');
  });

  it('el snapshot usa la prioridad editada para calcular el ahorro potencial', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await gasto(db, efectivo, 10000, 'Comida', new Date(2026, 6, 10));
    await ingreso(db, efectivo, 50000, new Date(2026, 6, 1));

    await setCategoryPriority(db, 'Comida', 'essential');
    const snapshotEssential = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const comidaEssential = snapshotEssential.categoryExpenses.find((c) => c.category === 'Comida')!;
    expect(comidaEssential.potentialSavings).toBe(0);

    await setCategoryPriority(db, 'Comida', 'discretionary');
    const snapshotDiscretionary = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const comidaDiscretionary = snapshotDiscretionary.categoryExpenses.find((c) => c.category === 'Comida')!;
    expect(comidaDiscretionary.potentialSavings).toBeGreaterThan(0);
  });

  it('presupuestos solo se adjuntan cuando el período es el mes en curso', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await setBudget(db, 'Comida', 5000);
    await gasto(db, efectivo, 3000, 'Comida', new Date(2026, 6, 10));

    const currentMonthSnapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const comidaCurrent = currentMonthSnapshot.categoryExpenses.find((c) => c.category === 'Comida')!;
    expect(comidaCurrent.currentBudget).toBe(5000);
    expect(comidaCurrent.budgetUsagePercentage).toBe(60);

    const sixMonthsSnapshot = await buildFinancialSnapshot(db, { preset: 'last_6_months', now: NOW });
    const comidaSixMonths = sixMonthsSnapshot.categoryExpenses.find((c) => c.category === 'Comida')!;
    expect(comidaSixMonths.currentBudget).toBeNull();
    expect(comidaSixMonths.budgetUsagePercentage).toBeNull();
  });

  it('compara contra el período anterior equivalente y el promedio de 3 anteriores', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await gasto(db, efectivo, 1000, 'Comida', new Date(2026, 6, 10)); // julio (actual)
    await gasto(db, efectivo, 800, 'Comida', new Date(2026, 5, 10)); // junio (anterior)
    await gasto(db, efectivo, 600, 'Comida', new Date(2026, 4, 10)); // mayo
    await gasto(db, efectivo, 400, 'Comida', new Date(2026, 3, 10)); // abril

    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    expect(snapshot.previousPeriod.expense).toBe(800);
    // promedio de junio(800)/mayo(600)/abril(400) = 600
    expect(snapshot.previousPeriodsAverage.expense).toBe(600);
  });

  it('meta de ahorro configurada se refleja en el snapshot', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await ingreso(db, efectivo, 100000, new Date(2026, 6, 1));
    await gasto(db, efectivo, 30000, 'Comida', new Date(2026, 6, 5));
    await setSavingsGoal(db, { enabled: true, mode: 'income_percentage', targetValue: 50 });

    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    expect(snapshot.savingsGoal.enabled).toBe(true);
    expect(snapshot.savingsGoal.targetAmount).toBe(50000); // 50% de 100000
    expect(snapshot.savingsGoal.currentAmount).toBe(70000); // 100000 - 30000
    expect(snapshot.savingsGoal.reached).toBe(true);
  });

  it('calidad de datos insuficiente con pocos movimientos', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await gasto(db, efectivo, 100, 'Comida', new Date(2026, 6, 5));
    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    expect(snapshot.dataQuality.level).toBe('insufficient');
  });

  it('un fondo archivado con movimientos en el período sigue contando en las métricas', async () => {
    const db = await freshDb();
    const banco = await createFund(db, { name: 'Banco viejo' });
    await gasto(db, banco, 2000, 'Comida', new Date(2026, 6, 5));
    // Se ajusta el saldo a 0 para poder archivarlo (regla del dominio de fondos).
    await addMovement(db, {
      type: 'ajuste',
      amount: 2000,
      category: null,
      description: 'ajuste',
      rawText: 'ajuste',
      sourceFundId: null,
      destinationFundId: banco,
    });
    await archiveFund(db, banco);

    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const comida = snapshot.categoryExpenses.find((c) => c.category === 'Comida');
    expect(comida?.amount).toBe(2000);
  });

  it('período personalizado calcula correctamente días y rango', async () => {
    const db = await freshDb();
    const snapshot = await buildFinancialSnapshot(db, {
      preset: 'custom',
      custom: { start: new Date(2026, 6, 1), end: new Date(2026, 6, 10) },
      now: NOW,
    });
    expect(snapshot.period.days).toBe(10);
  });
});
