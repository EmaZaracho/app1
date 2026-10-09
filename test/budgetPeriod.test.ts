import { budgetRange } from '../src/domain/budgetPeriod';
import { getBudgetAlerts, getBudgets, setBudget } from '../src/db/budgetsRepo';
import { addMovement } from '../src/db/movementsRepo';
import { getFunds } from '../src/db/database';
import { freshDb } from './helpers';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();

describe('budgetRange', () => {
  it('mensual sigue el mes calendario', () => {
    expect(budgetRange('monthly', null, new Date(2026, 8, 20))).toEqual({
      start: day(2026, 9, 1),
      end: day(2026, 10, 1),
    });
  });

  it('quincenal repite ciclos de 15 días desde la fecha de inicio', () => {
    const anchor = '2026-09-03';
    expect(budgetRange('biweekly', anchor, new Date(2026, 8, 3))).toEqual({ start: day(2026, 9, 3), end: day(2026, 9, 18) });
    expect(budgetRange('biweekly', anchor, new Date(2026, 8, 17))).toEqual({ start: day(2026, 9, 3), end: day(2026, 9, 18) });
    expect(budgetRange('biweekly', anchor, new Date(2026, 8, 18))).toEqual({ start: day(2026, 9, 18), end: day(2026, 10, 3) });
  });

  it('semanal repite ciclos de 7 días y también hacia atrás desde el ancla', () => {
    const anchor = '2026-09-10';
    expect(budgetRange('weekly', anchor, new Date(2026, 8, 16))).toEqual({ start: day(2026, 9, 10), end: day(2026, 9, 17) });
    expect(budgetRange('weekly', anchor, new Date(2026, 8, 9))).toEqual({ start: day(2026, 9, 3), end: day(2026, 9, 10) });
  });

  it('sin ancla válida el ciclo arranca hoy', () => {
    expect(budgetRange('weekly', null, new Date(2026, 8, 5, 15))).toEqual({ start: day(2026, 9, 5), end: day(2026, 9, 12) });
  });
});

describe('presupuestos con período', () => {
  it('un presupuesto existente sin período se lee como mensual', async () => {
    const db = await freshDb();
    await db.runAsync("INSERT INTO budgets (category, monthly_limit) VALUES ('Comida', 100)");
    expect(await getBudgets(db)).toEqual([{ category: 'Comida', limit: 100, period: 'monthly', anchorDate: null }]);
  });

  it('guarda período y ancla, y el mensual descarta el ancla', async () => {
    const db = await freshDb();
    await setBudget(db, 'Comida', 100, 'biweekly', '2026-09-03');
    expect((await getBudgets(db))[0]).toMatchObject({ period: 'biweekly', anchorDate: '2026-09-03' });
    await setBudget(db, 'Comida', 100, 'monthly', '2026-09-03');
    expect((await getBudgets(db))[0]).toMatchObject({ period: 'monthly', anchorDate: null });
  });

  it('la alerta quincenal solo cuenta gastos del ciclo actual', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await setBudget(db, 'Comida', 50, 'biweekly', '2026-09-16');
    const gasto = (amount: number) =>
      addMovement(db, { type: 'gasto', amount, category: 'Comida', description: 'x', rawText: 'x', sourceFundId: efectivo, destinationFundId: null });
    const previo = await gasto(80); // ciclo anterior (01/09–15/09)
    const actual = await gasto(40); // ciclo actual (16/09–30/09)
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 8, 10, 12).toISOString(), previo.id]);
    await db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [new Date(2026, 8, 20, 12).toISOString(), actual.id]);

    const now = new Date(2026, 8, 25);
    expect(await getBudgetAlerts(db, null, now)).toHaveLength(0);

    await setBudget(db, 'Comida', 30, 'biweekly', '2026-09-16');
    expect(await getBudgetAlerts(db, null, now)).toEqual([
      { category: 'Comida', spent: 40, limit: 30, period: 'biweekly' },
    ]);
  });
});

describe('aviso preventivo de presupuesto', () => {
  it('avisa desde el 80% sin superar, marca superados y ordena por avance', async () => {
    const { getBudgetProgress } = await import('../src/db/budgetsRepo');
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const gasto = (amount: number, category: 'Comida' | 'Ocio' | 'Compras') =>
      addMovement(db, { type: 'gasto', amount, category, description: 'x', rawText: 'x', sourceFundId: efectivo, destinationFundId: null });
    await setBudget(db, 'Comida', 100);
    await setBudget(db, 'Ocio', 100);
    await setBudget(db, 'Compras', 100);
    await gasto(79, 'Comida'); // 79%: todavía sin aviso
    await gasto(80, 'Ocio'); // 80% exacto: cerca
    await gasto(130, 'Compras'); // superado

    const progress = await getBudgetProgress(db);
    expect(progress.map((p) => [p.category, p.status])).toEqual([
      ['Compras', 'exceeded'],
      ['Ocio', 'near'],
    ]);
    expect(progress[1].ratio).toBeCloseTo(0.8);
    // La alerta clásica sigue siendo solo "superado".
    expect((await getBudgetAlerts(db)).map((a) => a.category)).toEqual(['Compras']);
  });
});
