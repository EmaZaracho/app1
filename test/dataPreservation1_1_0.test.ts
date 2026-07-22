import { initDatabase } from '../src/db/schema';
import { createFund, getFundById, getFunds } from '../src/db/fundsRepo';
import { addMovement, getFundBalance } from '../src/db/database';
import { setBudget } from '../src/db/budgetsRepo';
import { setSavingsGoal } from '../src/db/financialPreferencesRepository';
import { setCategoryPriority } from '../src/db/categoryFinancialSettingsRepository';
import { insertRule } from '../src/db/recurringExpenseRulesRepository';
import { rescheduleOccurrence } from '../src/db/recurringExpenseOccurrencesRepository';
import { ensureOccurrencesForMonth } from '../src/recurring/recurringOccurrenceGenerator';
import { registerOccurrencePayment } from '../src/recurring/recurringPayment';
import type { SqlDatabase } from '../src/db/sqlDatabase';
import type { RecurringRuleInput } from '../src/types/recurringExpenses';
import { freshDb } from './helpers';

/** Vuelca tablas completas, ordenadas por id, para comparar snapshots exactos. */
async function dumpTable(db: SqlDatabase, table: string): Promise<unknown[]> {
  return db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`);
}

async function fullSnapshot(db: SqlDatabase) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return {
    userVersion: versionRow?.user_version,
    funds: await dumpTable(db, 'funds'),
    fundAliases: await dumpTable(db, 'fund_aliases'),
    movements: await dumpTable(db, 'movements'),
    budgets: await db.getAllAsync('SELECT * FROM budgets ORDER BY category'),
    financialPreferences: await dumpTable(db, 'financial_preferences'),
    categorySettings: await db.getAllAsync('SELECT * FROM category_financial_settings ORDER BY category'),
    recurringRules: await dumpTable(db, 'recurring_expense_rules'),
    recurringOccurrences: await dumpTable(db, 'recurring_expense_occurrences'),
  };
}

/**
 * Simula una instalación 1.0.0 real y ya en uso (varios fondos, movimientos
 * de los 4 tipos, presupuestos, meta de ahorro, prioridades, una regla
 * recurrente con una ocurrencia pending, una paid vinculada y una
 * reprogramada), y verifica que abrir la app 1.1.0 (reejecutar initDatabase,
 * como hace app.ts en cada arranque) no pierde ni altera absolutamente nada:
 * ni filas, ni ids, ni saldos, ni el fondo predeterminado, ni user_version.
 */
describe('conservación de datos: instalación 1.0.0 -> arranque 1.1.0', () => {
  it('preserva íntegramente todos los datos y es idempotente', async () => {
    const db = await freshDb();

    // --- Poblar como una instalación 1.0.0 real ya en uso ---------------
    const efectivo = (await getFunds(db, true))[0];
    const mpId = await createFund(db, { name: 'Mercado Pago', icon: '💳', color: '#00a', aliases: ['MP'] });

    await addMovement(db, {
      type: 'gasto',
      amount: 1500,
      category: 'Comida',
      description: 'Café',
      rawText: '[manual] Café',
      sourceFundId: efectivo.id,
      destinationFundId: null,
    });
    await addMovement(db, {
      type: 'ingreso',
      amount: 500000,
      category: 'Sueldo',
      description: 'Sueldo',
      rawText: '[manual] Sueldo',
      sourceFundId: null,
      destinationFundId: efectivo.id,
    });
    await addMovement(db, {
      type: 'transferencia',
      amount: 20000,
      category: null,
      description: 'Ahorro',
      rawText: '[manual] Ahorro',
      sourceFundId: efectivo.id,
      destinationFundId: mpId,
    });
    await addMovement(db, {
      type: 'ajuste',
      amount: 300,
      category: null,
      description: 'Ajuste manual de saldo',
      rawText: '[ajuste-manual] nuevo saldo',
      sourceFundId: null,
      destinationFundId: mpId,
    });

    await setBudget(db, 'Comida', 50000);
    await setSavingsGoal(db, { enabled: true, mode: 'fixed_amount', targetValue: 100000 });
    await setCategoryPriority(db, 'Entretenimiento', 'essential');

    const rule: RecurringRuleInput = {
      name: 'Internet',
      description: null,
      category: 'Servicios',
      amountMode: 'fixed',
      amount: 25000,
      fundAssignmentMode: 'fixed',
      fundId: efectivo.id,
      dayOfMonth: 10,
      startDate: '2026-08-01',
      endDate: null,
      isActive: true,
    };
    await insertRule(db, rule);
    await ensureOccurrencesForMonth(db, 2026, 7); // agosto: pending
    await ensureOccurrencesForMonth(db, 2026, 8); // septiembre: se paga

    const augustOcc = (await db.getAllAsync<{ id: number }>(
      "SELECT id FROM recurring_expense_occurrences WHERE occurrence_month = '2026-08'"
    ))[0];
    const septemberOcc = (await db.getAllAsync<{ id: number }>(
      "SELECT id FROM recurring_expense_occurrences WHERE occurrence_month = '2026-09'"
    ))[0];

    await rescheduleOccurrence(db, augustOcc.id, '2026-08-12'); // reprogramada
    await registerOccurrencePayment(db, {
      occurrenceId: septemberOcc.id,
      amount: 26000,
      category: 'Servicios',
      description: 'Internet',
      fundId: efectivo.id,
    });

    const balancesBefore = {
      efectivo: await getFundBalance(db, efectivo.id),
      mp: await getFundBalance(db, mpId),
    };
    const defaultFundBefore = (await getFunds(db, true)).find((f) => f.isDefault)?.id;
    const before = await fullSnapshot(db);

    // --- Simula el arranque de la 1.1.0: initDatabase de nuevo -----------
    await initDatabase(db);
    const after = await fullSnapshot(db);

    expect(after).toEqual(before);
    expect(after.userVersion).toBe(before.userVersion); // PRAGMA user_version sin cambios

    const balancesAfter = {
      efectivo: await getFundBalance(db, efectivo.id),
      mp: await getFundBalance(db, mpId),
    };
    expect(balancesAfter).toEqual(balancesBefore);

    const defaultFundAfter = (await getFunds(db, true)).find((f) => f.isDefault)?.id;
    expect(defaultFundAfter).toBe(defaultFundBefore);
    expect(defaultFundAfter).toBe(efectivo.id);

    const fundsAfter = await getFunds(db, true);
    expect(fundsAfter.filter((f) => f.name === 'Efectivo')).toHaveLength(1);
    expect(fundsAfter.filter((f) => f.name === 'Mercado Pago')).toHaveLength(1);

    // La regla sigue activa y las ocurrencias mantienen sus estados/vínculos.
    const ruleAfter = (await db.getAllAsync<{ is_active: number }>(
      'SELECT is_active FROM recurring_expense_rules WHERE id = ?',
      [1]
    ))[0];
    expect(ruleAfter.is_active).toBe(1);

    const augustAfter = (await db.getFirstAsync<{ status: string; is_manually_modified: number; scheduled_date: string }>(
      'SELECT status, is_manually_modified, scheduled_date FROM recurring_expense_occurrences WHERE id = ?',
      [augustOcc.id]
    ))!;
    expect(augustAfter.status).toBe('pending');
    expect(augustAfter.is_manually_modified).toBe(1);
    expect(augustAfter.scheduled_date).toBe('2026-08-12');

    const septemberAfter = (await db.getFirstAsync<{ status: string; linked_movement_id: number | null }>(
      'SELECT status, linked_movement_id FROM recurring_expense_occurrences WHERE id = ?',
      [septemberOcc.id]
    ))!;
    expect(septemberAfter.status).toBe('paid');
    expect(septemberAfter.linked_movement_id).not.toBeNull();

    // --- Idempotencia: reabrir la app una tercera vez tampoco cambia nada ---
    await initDatabase(db);
    const third = await fullSnapshot(db);
    expect(third).toEqual(before);
  });

  it('un fondo con id explícito (fondo predeterminado histórico) conserva su id tras reabrir', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, true))[0];
    const originalId = efectivo.id;

    await initDatabase(db);
    await initDatabase(db);

    const efectivoAfter = await getFundById(db, originalId);
    expect(efectivoAfter).not.toBeNull();
    expect(efectivoAfter?.id).toBe(originalId);
    expect(efectivoAfter?.isDefault).toBe(true);
  });
});
