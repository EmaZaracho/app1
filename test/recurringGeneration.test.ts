import { insertRule, getRules } from '../src/db/recurringExpenseRulesRepository';
import {
  deleteOccurrence,
  getOccurrencesForMonth,
  setOccurrenceStatus,
} from '../src/db/recurringExpenseOccurrencesRepository';
import { ensureOccurrencesForMonth } from '../src/recurring/recurringOccurrenceGenerator';
import type { RecurringRuleInput } from '../src/types/recurringExpenses';
import { freshDb } from './helpers';

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

describe('generación mensual bajo demanda', () => {
  it('genera una ocurrencia para el mes pedido', async () => {
    const db = await freshDb();
    await insertRule(db, rule());
    await ensureOccurrencesForMonth(db, 2026, 7); // agosto
    const occs = await getOccurrencesForMonth(db, '2026-08');
    expect(occs).toHaveLength(1);
    expect(occs[0].scheduledDate).toBe('2026-08-10');
    expect(occs[0].projectedAmount).toBe(25000);
  });

  it('es idempotente: reejecutar no duplica', async () => {
    const db = await freshDb();
    await insertRule(db, rule());
    await ensureOccurrencesForMonth(db, 2026, 7);
    await ensureOccurrencesForMonth(db, 2026, 7);
    await ensureOccurrencesForMonth(db, 2026, 7);
    expect(await getOccurrencesForMonth(db, '2026-08')).toHaveLength(1);
  });

  it('solo genera el mes pedido', async () => {
    const db = await freshDb();
    await insertRule(db, rule());
    await ensureOccurrencesForMonth(db, 2026, 7);
    expect(await getOccurrencesForMonth(db, '2026-09')).toHaveLength(0);
  });

  it('ignora reglas inactivas', async () => {
    const db = await freshDb();
    await insertRule(db, rule({ isActive: false }));
    await ensureOccurrencesForMonth(db, 2026, 7);
    expect(await getOccurrencesForMonth(db, '2026-08')).toHaveLength(0);
  });

  it('respeta start_date: no genera antes del inicio', async () => {
    const db = await freshDb();
    await insertRule(db, rule({ startDate: '2026-08-20', dayOfMonth: 10 }));
    // agosto: fecha 10 < start 20 → no aplica
    await ensureOccurrencesForMonth(db, 2026, 7);
    expect(await getOccurrencesForMonth(db, '2026-08')).toHaveLength(0);
    // septiembre: fecha 10 >= start → aplica
    await ensureOccurrencesForMonth(db, 2026, 8);
    expect(await getOccurrencesForMonth(db, '2026-09')).toHaveLength(1);
  });

  it('respeta end_date: no genera después del fin', async () => {
    const db = await freshDb();
    await insertRule(db, rule({ endDate: '2026-08-31' }));
    await ensureOccurrencesForMonth(db, 2026, 8); // septiembre, después del fin
    expect(await getOccurrencesForMonth(db, '2026-09')).toHaveLength(0);
  });

  it('conserva excepciones/estados ya almacenados al regenerar', async () => {
    const db = await freshDb();
    await insertRule(db, rule());
    await ensureOccurrencesForMonth(db, 2026, 7);
    const [occ] = await getOccurrencesForMonth(db, '2026-08');
    await setOccurrenceStatus(db, occ.id, 'skipped');
    await ensureOccurrencesForMonth(db, 2026, 7); // regenerar
    const after = await getOccurrencesForMonth(db, '2026-08');
    expect(after).toHaveLength(1);
    expect(after[0].storedStatus).toBe('skipped');
  });

  it('una ocurrencia eliminada no vuelve a aparecer al recargar el calendario', async () => {
    const db = await freshDb();
    await insertRule(db, rule());
    await ensureOccurrencesForMonth(db, 2026, 7);
    const [occ] = await getOccurrencesForMonth(db, '2026-08');
    await deleteOccurrence(db, occ.id);
    expect(await getOccurrencesForMonth(db, '2026-08')).toHaveLength(0);
    // Simula volver a entrar al calendario: no debe regenerarla.
    await ensureOccurrencesForMonth(db, 2026, 7);
    expect(await getOccurrencesForMonth(db, '2026-08')).toHaveLength(0);
  });

  it('no permite crear una regla con fondo archivado', async () => {
    const db = await freshDb();
    const efectivo = (await getRules(db, {})) && (await db.getAllAsync<{ id: number }>('SELECT id FROM funds'));
    const fundId = efectivo[0].id;
    // Crear un segundo fondo y archivar el primero requeriría saldo 0; en su
    // lugar marcamos el fondo como archivado directo para el test de validación.
    await db.runAsync('UPDATE funds SET is_archived = 1 WHERE id = ?', [fundId]);
    await expect(
      insertRule(db, rule({ fundAssignmentMode: 'fixed', fundId }))
    ).rejects.toThrow();
  });
});
