import { getFunds } from '../src/db/fundsRepo';
import { addMovement } from '../src/db/movementsRepo';
import { setBudget } from '../src/db/budgetsRepo';
import { buildFinancialSnapshot } from '../src/analytics/financialSnapshot';
import { computeSnapshotHash } from '../src/analytics/snapshotHash';
import { freshDb } from './helpers';
import type { SavingsGoal } from '../src/types/financialAnalytics';

const NOW = new Date(2026, 6, 20, 12, 0, 0);
const NO_GOAL: SavingsGoal = { enabled: false, mode: 'fixed_amount', targetValue: 0 };

describe('hash de invalidación de caché', () => {
  it('mismos datos y configuración producen el mismo hash', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await addMovement(db, {
      type: 'gasto',
      amount: 100,
      category: 'Comida',
      description: 'x',
      rawText: 'x',
      sourceFundId: efectivo,
      destinationFundId: null,
    });
    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const priorities = { Comida: 'flexible' as const };
    const h1 = computeSnapshotHash(snapshot, 'deepseek', priorities, NO_GOAL);
    const h2 = computeSnapshotHash(snapshot, 'deepseek', priorities, NO_GOAL);
    expect(h1).toBe(h2);
  });

  it('un movimiento nuevo invalida el hash', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const snapshotBefore = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const hashBefore = computeSnapshotHash(snapshotBefore, 'deepseek', {}, NO_GOAL);

    await addMovement(db, {
      type: 'gasto',
      amount: 500,
      category: 'Comida',
      description: 'x',
      rawText: 'x',
      sourceFundId: efectivo,
      destinationFundId: null,
    });
    const snapshotAfter = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const hashAfter = computeSnapshotHash(snapshotAfter, 'deepseek', {}, NO_GOAL);
    expect(hashAfter).not.toBe(hashBefore);
  });

  it('cambiar el proveedor invalida el hash', async () => {
    const db = await freshDb();
    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const h1 = computeSnapshotHash(snapshot, 'deepseek', {}, NO_GOAL);
    const h2 = computeSnapshotHash(snapshot, 'gemini', {}, NO_GOAL);
    expect(h1).not.toBe(h2);
  });

  it('cambiar la prioridad de una categoría invalida el hash', async () => {
    const db = await freshDb();
    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const h1 = computeSnapshotHash(snapshot, 'deepseek', { Comida: 'flexible' }, NO_GOAL);
    const h2 = computeSnapshotHash(snapshot, 'deepseek', { Comida: 'discretionary' }, NO_GOAL);
    expect(h1).not.toBe(h2);
  });

  it('cambiar la meta de ahorro invalida el hash', async () => {
    const db = await freshDb();
    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const h1 = computeSnapshotHash(snapshot, 'deepseek', {}, NO_GOAL);
    const h2 = computeSnapshotHash(snapshot, 'deepseek', {}, { enabled: true, mode: 'fixed_amount', targetValue: 1000 });
    expect(h1).not.toBe(h2);
  });

  it('cambiar un presupuesto (que afecta al snapshot en el mes actual) invalida el hash', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await addMovement(db, {
      type: 'gasto',
      amount: 100,
      category: 'Comida',
      description: 'x',
      rawText: 'x',
      sourceFundId: efectivo,
      destinationFundId: null,
    });
    const before = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const hashBefore = computeSnapshotHash(before, 'deepseek', {}, NO_GOAL);

    await setBudget(db, 'Comida', 5000);
    const after = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const hashAfter = computeSnapshotHash(after, 'deepseek', {}, NO_GOAL);
    expect(hashAfter).not.toBe(hashBefore);
  });

  it('el hash nunca incluye una API key (no se le pasa como argumento)', () => {
    // Prueba estructural: computeSnapshotHash no acepta ningún parámetro de key.
    expect(computeSnapshotHash.length).toBe(4); // snapshot, provider, priorities, savingsGoal
  });
});
