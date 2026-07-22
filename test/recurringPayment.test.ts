import { insertRule } from '../src/db/recurringExpenseRulesRepository';
import {
  deleteOccurrence,
  getOccurrenceById,
  getOccurrencesForMonth,
  setOccurrenceStatus,
} from '../src/db/recurringExpenseOccurrencesRepository';
import { ensureOccurrencesForMonth } from '../src/recurring/recurringOccurrenceGenerator';
import {
  deleteMovementAndUnlinkOccurrence,
  reconcileOccurrences,
  registerOccurrencePayment,
  relinkOccurrence,
  unlinkOccurrenceForMovement,
} from '../src/recurring/recurringPayment';
import { getMovementById, deleteMovement } from '../src/db/movementsRepo';
import { getFundBalance } from '../src/db/balances';
import type { RecurringRuleInput } from '../src/types/recurringExpenses';
import { freshDb } from './helpers';

async function setup() {
  const db = await freshDb();
  const funds = await db.getAllAsync<{ id: number }>('SELECT id FROM funds');
  const fundId = funds[0].id;
  const rule: RecurringRuleInput = {
    name: 'Internet',
    description: null,
    category: 'Servicios',
    amountMode: 'estimated',
    amount: 25000,
    fundAssignmentMode: 'fixed',
    fundId,
    dayOfMonth: 10,
    startDate: '2026-08-01',
    endDate: null,
    isActive: true,
  };
  await insertRule(db, rule);
  await ensureOccurrencesForMonth(db, 2026, 7);
  const [occ] = await getOccurrencesForMonth(db, '2026-08');
  return { db, fundId, occ };
}

describe('registro y vinculación de movimiento', () => {
  it('registrar gasto crea el movimiento, lo vincula y marca paid con el monto real', async () => {
    const { db, fundId, occ } = await setup();
    const balanceBefore = await getFundBalance(db, fundId);

    const movementId = await registerOccurrencePayment(db, {
      occurrenceId: occ.id,
      amount: 27300, // real distinto del proyectado 25000
      category: 'Servicios',
      description: 'Internet',
      fundId,
    });

    const updated = await getOccurrenceById(db, occ.id);
    expect(updated?.storedStatus).toBe('paid');
    expect(updated?.linkedMovementId).toBe(movementId);
    expect(updated?.projectedAmount).toBe(25000); // el proyectado NO cambia

    const mov = await getMovementById(db, movementId);
    expect(mov?.amount).toBe(27300);

    // El saldo real refleja el monto real, no el proyectado.
    expect(await getFundBalance(db, fundId)).toBe(balanceBefore - 27300);
  });

  it('no permite registrar dos veces la misma ocurrencia', async () => {
    const { db, fundId, occ } = await setup();
    await registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId });
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).rejects.toThrow();
  });

  it('eliminar el movimiento (con unlink) revierte la ocurrencia a pending', async () => {
    const { db, fundId, occ } = await setup();
    const movementId = await registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId });

    const freed = await unlinkOccurrenceForMovement(db, movementId);
    expect(freed).toBe(occ.id);
    await deleteMovement(db, movementId);

    const after = await getOccurrenceById(db, occ.id);
    expect(after?.storedStatus).toBe('pending');
    expect(after?.linkedMovementId).toBeNull();
  });

  it('elimina y desvincula atomicamente', async () => {
    const { db, fundId, occ } = await setup();
    const movementId = await registerOccurrencePayment(db, {
      occurrenceId: occ.id,
      amount: 100,
      category: 'Servicios',
      description: 'x',
      fundId,
    });

    await expect(deleteMovementAndUnlinkOccurrence(db, movementId)).resolves.toBe(occ.id);
    expect(await getMovementById(db, movementId)).toBeNull();
    const after = await getOccurrenceById(db, occ.id);
    expect(after?.storedStatus).toBe('pending');
    expect(after?.linkedMovementId).toBeNull();
  });

  it('revierte la desvinculacion si falla el borrado', async () => {
    const { db, fundId, occ } = await setup();
    const movementId = await registerOccurrencePayment(db, {
      occurrenceId: occ.id,
      amount: 100,
      category: 'Servicios',
      description: 'x',
      fundId,
    });
    await db.execAsync(`
      CREATE TRIGGER fail_movement_delete
      BEFORE DELETE ON movements
      BEGIN
        SELECT RAISE(ABORT, 'forced delete failure');
      END;
    `);

    await expect(deleteMovementAndUnlinkOccurrence(db, movementId)).rejects.toThrow('forced delete failure');
    expect(await getMovementById(db, movementId)).not.toBeNull();
    const after = await getOccurrenceById(db, occ.id);
    expect(after?.storedStatus).toBe('paid');
    expect(after?.linkedMovementId).toBe(movementId);
  });

  it('reconcile revierte a pending si el movimiento se borró sin unlink (FK SET NULL)', async () => {
    const { db, fundId, occ } = await setup();
    const movementId = await registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId });
    // Borrado directo: la FK ON DELETE SET NULL deja el link en NULL pero status queda 'paid'.
    await deleteMovement(db, movementId);
    let after = await getOccurrenceById(db, occ.id);
    expect(after?.linkedMovementId).toBeNull();
    await reconcileOccurrences(db);
    after = await getOccurrenceById(db, occ.id);
    expect(after?.storedStatus).toBe('pending');
  });

  it('relink (deshacer) recupera la vinculación y marca paid', async () => {
    const { db, fundId, occ } = await setup();
    const movementId = await registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId });
    await unlinkOccurrenceForMovement(db, movementId);
    // el movimiento sigue existiendo (undo lo restaura); re-vinculamos
    await relinkOccurrence(db, occ.id, movementId);
    const after = await getOccurrenceById(db, occ.id);
    expect(after?.storedStatus).toBe('paid');
    expect(after?.linkedMovementId).toBe(movementId);
  });
});

describe('registerOccurrencePayment: refuerzo de validación de estado', () => {
  it('acepta una ocurrencia pending (futura)', async () => {
    const { db, fundId, occ } = await setup();
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).resolves.toBeGreaterThan(0);
  });

  it('acepta un overdue (sigue siendo pending internamente)', async () => {
    const { db, fundId, occ } = await setup();
    // La ocurrencia vencida sigue con storedStatus 'pending'; solo cambia el
    // effectiveStatus derivado en lectura según la fecha de "hoy".
    const before = await getOccurrenceById(db, occ.id, new Date('2099-01-01'));
    expect(before?.effectiveStatus).toBe('overdue');
    expect(before?.storedStatus).toBe('pending');
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).resolves.toBeGreaterThan(0);
  });

  it('rechaza una ocurrencia paid', async () => {
    const { db, fundId, occ } = await setup();
    await registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId });
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).rejects.toThrow('Solo se pueden registrar pagos de ocurrencias pendientes.');
  });

  it('rechaza una ocurrencia skipped', async () => {
    const { db, fundId, occ } = await setup();
    await setOccurrenceStatus(db, occ.id, 'skipped');
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).rejects.toThrow('Solo se pueden registrar pagos de ocurrencias pendientes.');
  });

  it('rechaza una ocurrencia cancelled', async () => {
    const { db, fundId, occ } = await setup();
    await setOccurrenceStatus(db, occ.id, 'cancelled');
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).rejects.toThrow('Solo se pueden registrar pagos de ocurrencias pendientes.');
  });

  it('rechaza una ocurrencia deleted', async () => {
    const { db, fundId, occ } = await setup();
    await deleteOccurrence(db, occ.id);
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).rejects.toThrow('Solo se pueden registrar pagos de ocurrencias pendientes.');
  });

  it('reactivar una skipped la vuelve pending y ahí sí se puede pagar', async () => {
    const { db, fundId, occ } = await setup();
    await setOccurrenceStatus(db, occ.id, 'skipped');
    await setOccurrenceStatus(db, occ.id, 'pending'); // reactivar
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).resolves.toBeGreaterThan(0);
  });

  it('reactivar una cancelled la vuelve pending y ahí sí se puede pagar', async () => {
    const { db, fundId, occ } = await setup();
    await setOccurrenceStatus(db, occ.id, 'cancelled');
    await setOccurrenceStatus(db, occ.id, 'pending'); // reactivar
    await expect(
      registerOccurrencePayment(db, { occurrenceId: occ.id, amount: 100, category: 'Servicios', description: 'x', fundId })
    ).resolves.toBeGreaterThan(0);
  });
});
