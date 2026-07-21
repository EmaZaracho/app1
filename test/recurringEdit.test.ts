import { getRuleById, insertRule } from '../src/db/recurringExpenseRulesRepository';
import {
  getOccurrencesForMonth,
  rescheduleOccurrence,
} from '../src/db/recurringExpenseOccurrencesRepository';
import { ensureOccurrencesForMonth } from '../src/recurring/recurringOccurrenceGenerator';
import { registerOccurrencePayment } from '../src/recurring/recurringPayment';
import {
  deleteOccurrenceAndFollowing,
  editThisAndFollowing,
  editWholeSeries,
} from '../src/recurring/recurringRuleEditing';
import type { RecurringRuleInput } from '../src/types/recurringExpenses';
import { freshDb } from './helpers';

function rule(fid: number, overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput {
  return {
    name: 'Internet',
    description: null,
    category: 'Servicios',
    amountMode: 'fixed',
    amount: 20000,
    fundAssignmentMode: 'fixed',
    fundId: fid,
    dayOfMonth: 10,
    startDate: '2026-08-01',
    endDate: null,
    isActive: true,
    ...overrides,
  };
}

async function setup() {
  const db = await freshDb();
  const funds = await db.getAllAsync<{ id: number }>('SELECT id FROM funds');
  const fid = funds[0].id;
  const ruleId = await insertRule(db, rule(fid));
  await ensureOccurrencesForMonth(db, 2026, 7); // ago
  await ensureOccurrencesForMonth(db, 2026, 8); // sep
  return { db, fid, ruleId };
}

describe('edición: toda la serie', () => {
  it('actualiza futuras pending no modificadas, sin tocar pagadas', async () => {
    const { db, fid, ruleId } = await setup();
    const [aug] = await getOccurrencesForMonth(db, '2026-08');
    await registerOccurrencePayment(db, { occurrenceId: aug.id, amount: 20000, category: 'Servicios', description: 'x', fundId: fid });

    await editWholeSeries(db, ruleId, rule(fid, { amount: 30000 }), '2026-08');

    const [augAfter] = await getOccurrencesForMonth(db, '2026-08');
    const [sepAfter] = await getOccurrencesForMonth(db, '2026-09');
    expect(augAfter.storedStatus).toBe('paid');
    expect(augAfter.projectedAmount).toBe(20000); // pagada: proyectado intacto
    expect(sepAfter.projectedAmount).toBe(30000); // futura pending: actualizada
  });

  it('no toca ocurrencias modificadas manualmente', async () => {
    const { db, ruleId, fid } = await setup();
    const [sep] = await getOccurrencesForMonth(db, '2026-09');
    await rescheduleOccurrence(db, sep.id, '2026-09-12'); // marca is_manually_modified
    await editWholeSeries(db, ruleId, rule(fid, { amount: 30000 }), '2026-08');
    const [sepAfter] = await getOccurrencesForMonth(db, '2026-09');
    expect(sepAfter.projectedAmount).toBe(20000); // sin cambios
  });
});

describe('edición: esta y las siguientes', () => {
  it('finaliza la regla original y crea una nueva desde el mes elegido', async () => {
    const { db, fid, ruleId } = await setup();
    const newRuleId = await editThisAndFollowing(db, ruleId, '2026-09', rule(fid, { amount: 30000 }));

    const original = await getRuleById(db, ruleId);
    expect(original?.endDate).toBe('2026-08-31'); // terminada antes de septiembre
    expect(newRuleId).not.toBe(ruleId);

    // Agosto queda bajo la regla vieja, sin cambios.
    const [aug] = await getOccurrencesForMonth(db, '2026-08');
    expect(aug.ruleId).toBe(ruleId);
    expect(aug.projectedAmount).toBe(20000);

    // Septiembre se regeneró bajo la regla nueva con el monto nuevo.
    const [sep] = await getOccurrencesForMonth(db, '2026-09');
    expect(sep.ruleId).toBe(newRuleId);
    expect(sep.projectedAmount).toBe(30000);
  });

  it('no modifica ocurrencias pagadas de meses anteriores', async () => {
    const { db, fid, ruleId } = await setup();
    const [aug] = await getOccurrencesForMonth(db, '2026-08');
    await registerOccurrencePayment(db, { occurrenceId: aug.id, amount: 21000, category: 'Servicios', description: 'x', fundId: fid });

    await editThisAndFollowing(db, ruleId, '2026-09', rule(fid, { amount: 30000 }));

    const [augAfter] = await getOccurrencesForMonth(db, '2026-08');
    expect(augAfter.storedStatus).toBe('paid');
    expect(augAfter.ruleId).toBe(ruleId);
    expect(augAfter.projectedAmount).toBe(20000);
  });
});

describe('eliminar: esta y las siguientes', () => {
  it('borra la ocurrencia elegida y las futuras, sin tocar meses anteriores', async () => {
    const { db, ruleId } = await setup();
    const [aug] = await getOccurrencesForMonth(db, '2026-08');
    const [sep] = await getOccurrencesForMonth(db, '2026-09');

    await deleteOccurrenceAndFollowing(db, sep.id);

    expect(await getOccurrencesForMonth(db, '2026-09')).toHaveLength(0);
    expect(await getOccurrencesForMonth(db, '2026-08')).toHaveLength(1);
    const augAfter = (await getOccurrencesForMonth(db, '2026-08'))[0];
    expect(augAfter.id).toBe(aug.id);

    const rule = await getRuleById(db, ruleId);
    expect(rule?.endDate).toBe('2026-08-31');

    // No revive en meses futuros aunque se recargue el calendario.
    await ensureOccurrencesForMonth(db, 2026, 9); // octubre
    expect(await getOccurrencesForMonth(db, '2026-10')).toHaveLength(0);
  });

  it('no borra ocurrencias ya pagadas de meses futuros', async () => {
    const { db, fid, ruleId } = await setup();
    const [sep] = await getOccurrencesForMonth(db, '2026-09');
    await registerOccurrencePayment(db, { occurrenceId: sep.id, amount: 20000, category: 'Servicios', description: 'x', fundId: fid });

    await deleteOccurrenceAndFollowing(db, sep.id);

    const [sepAfter] = await getOccurrencesForMonth(db, '2026-09');
    expect(sepAfter.storedStatus).toBe('paid');
    expect(sepAfter.id).toBe(sep.id);
    const rule = await getRuleById(db, ruleId);
    expect(rule?.endDate).toBe('2026-08-31');
  });

  it('si se elimina desde el primer mes de la regla, usa start_date como cutoff válido', async () => {
    const db = await freshDb();
    const funds = await db.getAllAsync<{ id: number }>('SELECT id FROM funds');
    const fid = funds[0].id;
    const ruleId = await insertRule(db, rule(fid));
    await ensureOccurrencesForMonth(db, 2026, 7); // agosto: primer mes de la regla
    const [aug] = await getOccurrencesForMonth(db, '2026-08');

    await deleteOccurrenceAndFollowing(db, aug.id);

    const updatedRule = await getRuleById(db, ruleId);
    expect(updatedRule?.endDate).toBe('2026-08-01');
    expect(await getOccurrencesForMonth(db, '2026-08')).toHaveLength(0);
  });
});
