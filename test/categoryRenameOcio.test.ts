import { initDatabase } from '../src/db/schema';
import { getBudgets } from '../src/db/budgetsRepo';
import { getCategoryPriorities } from '../src/db/categoryFinancialSettingsRepository';
import { addMovement } from '../src/db/movementsRepo';
import { getFunds } from '../src/db/database';
import { freshDb } from './helpers';

describe('migración Entretenimiento -> Ocio', () => {
  it('renombra movimientos, presupuestos y prioridades existentes', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const mov0 = await addMovement(db, { type: 'gasto', amount: 10, category: 'Comida', description: 'cine', rawText: 'x', sourceFundId: efectivo, destinationFundId: null });
    await db.runAsync("UPDATE movements SET category = 'Entretenimiento' WHERE id = ?", [mov0.id]);
    await db.runAsync("INSERT INTO budgets (category, monthly_limit) VALUES ('Entretenimiento', 500)");
    await db.runAsync(
      "INSERT INTO category_financial_settings (category, spending_priority, updated_at) VALUES ('Entretenimiento', 'essential', ?)",
      [new Date().toISOString()]
    );
    await db.execAsync('PRAGMA user_version = 6;');

    await initDatabase(db);

    const mov = await db.getFirstAsync<{ category: string }>('SELECT category FROM movements');
    expect(mov?.category).toBe('Ocio');
    expect((await getBudgets(db))[0]).toMatchObject({ category: 'Ocio', limit: 500 });
    const prios = await getCategoryPriorities(db);
    expect(prios.find((p) => p.category === 'Ocio')?.priority).toBe('essential');
    const old = await db.getFirstAsync('SELECT 1 FROM budgets WHERE category = ?', ['Entretenimiento']);
    expect(old).toBeNull();
  });
});
