import { initDatabase } from '../src/db/schema';
import {
  deleteOccurrence,
  getOccurrenceById,
  getOccurrencesForMonth,
  insertOccurrence,
  setOccurrenceStatus,
} from '../src/db/recurringExpenseOccurrencesRepository';
import { insertRule } from '../src/db/recurringExpenseRulesRepository';
import { ensureOccurrencesForMonth } from '../src/recurring/recurringOccurrenceGenerator';
import type { RecurringRuleInput } from '../src/types/recurringExpenses';
import { createTestDb } from './betterSqliteAdapter';

function rule(overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput {
  return {
    name: 'Internet',
    description: null,
    category: 'Servicios',
    amountMode: 'fixed',
    amount: 25000,
    fundAssignmentMode: 'ask_on_payment',
    fundId: null,
    dayOfMonth: 10,
    startDate: '2026-08-01',
    endDate: null,
    isActive: true,
    ...overrides,
  };
}

/**
 * Simula un dispositivo real con la app ya instalada en SCHEMA_VERSION 3
 * (constraint de status sin 'deleted'), con historial de ocurrencias en
 * distintos estados, y verifica que la migración a la v4 (agregada para
 * soportar el soft-delete de ocurrencias) preserva todo y deja la tabla
 * usable.
 */
describe('migración recurring_expense_occurrences v3 -> v4 (status deleted)', () => {
  it('preserva ocurrencias existentes de un esquema pre-v4 y permite soft-delete después', async () => {
    const { db, raw } = createTestDb();

    // Recrea el esquema v3 (sin 'deleted' en el CHECK) tal como quedó una
    // instalación real antes de este cambio.
    await initDatabase(db);
    raw.exec('PRAGMA user_version = 3;');

    const ruleId = await insertRule(db, rule());
    await ensureOccurrencesForMonth(db, 2026, 7); // agosto: crea 1 ocurrencia pending
    const augOcc = (await getOccurrencesForMonth(db, '2026-08'))[0];
    await setOccurrenceStatus(db, augOcc.id, 'paid');

    const septOccId = await insertOccurrence(
      db,
      {
        ruleId,
        occurrenceMonth: '2026-09',
        originalScheduledDate: '2026-09-10',
        scheduledDate: '2026-09-10',
        projectedAmount: 25000,
        category: 'Servicios',
        fundAssignmentMode: 'ask_on_payment',
        fundId: null,
      }
    );

    // Reejecuta initDatabase como hace la app en cada arranque: debe migrar
    // de user_version 3 a 4 sin perder datos.
    await initDatabase(db);
    const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(versionRow?.user_version).toBe(4);

    const augAfter = await getOccurrenceById(db, augOcc.id);
    expect(augAfter?.storedStatus).toBe('paid');
    const septAfter = await getOccurrenceById(db, septOccId);
    expect(septAfter?.storedStatus).toBe('pending');

    // El bug reportado: borrar la ocurrencia de septiembre no debe dejar que
    // vuelva a aparecer al recargar el calendario.
    await deleteOccurrence(db, septOccId);
    expect(await getOccurrenceById(db, septOccId)).toBeNull();
    expect(await getOccurrencesForMonth(db, '2026-09')).toHaveLength(0);
    await ensureOccurrencesForMonth(db, 2026, 8);
    expect(await getOccurrencesForMonth(db, '2026-09')).toHaveLength(0);
  });
});
