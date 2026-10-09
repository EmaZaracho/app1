import { getFunds } from '../src/db/database';
import { addMovement, getExpensesForCategory } from '../src/db/movementsRepo';
import { getExpenseCategoryTotalsForRange, monthRange } from '../src/db/summaryRepo';
import { freshDb } from './helpers';

describe('gastos que componen el total de una categoría', () => {
  it('coinciden con el total del resumen, respetan el mes y excluyen otros tipos', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const gasto = (amount: number, category: 'Comida' | 'Ocio', description: string) =>
      addMovement(db, { type: 'gasto', amount, category, description, rawText: 'x', sourceFundId: efectivo, destinationFundId: null });
    const at = (id: number, d: Date) => db.runAsync('UPDATE movements SET created_at = ? WHERE id = ?', [d.toISOString(), id]);

    const a = await gasto(100, 'Comida', 'almuerzo');
    const b = await gasto(50, 'Comida', 'cena');
    const c = await gasto(30, 'Comida', 'mes anterior');
    const d = await gasto(70, 'Ocio', 'cine');
    await at(a.id, new Date(2026, 8, 5, 12));
    await at(b.id, new Date(2026, 8, 20, 12));
    await at(c.id, new Date(2026, 7, 28, 12));
    await at(d.id, new Date(2026, 8, 10, 12));
    // categoría desconocida: cuenta como Otros, igual que en los totales
    const e = await gasto(10, 'Comida', 'raro');
    await db.runAsync("UPDATE movements SET category = 'Vieja', created_at = ? WHERE id = ?", [new Date(2026, 8, 12, 12).toISOString(), e.id]);

    const range = monthRange('2026-09');
    const comida = await getExpensesForCategory(db, 'Comida', range);
    expect(comida.map((m) => m.description)).toEqual(['cena', 'almuerzo']);

    const totals = await getExpenseCategoryTotalsForRange(db, range);
    for (const cat of ['Comida', 'Ocio', 'Otros'] as const) {
      const list = await getExpensesForCategory(db, cat, range);
      expect(list.reduce((s, m) => s + m.amount, 0)).toBe(totals.find((t) => t.category === cat)?.total ?? 0);
    }
    expect((await getExpensesForCategory(db, 'Otros', range)).map((m) => m.description)).toEqual(['raro']);

    expect(await getExpensesForCategory(db, 'Comida', null)).toHaveLength(3);
    const baseline = new Date(2026, 8, 10).toISOString();
    expect((await getExpensesForCategory(db, 'Comida', null, baseline)).map((m) => m.description)).toEqual(['cena']);
  });
});
