import { validateMovement } from '../domain/movementRules';
import type { ExpenseCategory } from '../types';
import type { NewMovement } from '../types';
import type { SqlDatabase } from '../db/sqlDatabase';
import { todayLocalDateString } from './recurringDateUtils';

export interface RegisterPaymentInput {
  occurrenceId: number;
  amount: number;
  category: ExpenseCategory;
  description: string;
  fundId: number;
  /** Fecha real del pago (ISO). Por defecto ahora. */
  paidAt?: string;
}

/**
 * Registra el gasto real de una ocurrencia: crea el movimiento y lo vincula a
 * la ocurrencia (status → paid), TODO en una transacción. Nunca marca una
 * ocurrencia como paid sin un movimiento real asociado. No modifica el monto
 * proyectado histórico de la ocurrencia.
 */
export async function registerOccurrencePayment(
  db: SqlDatabase,
  input: RegisterPaymentInput
): Promise<number> {
  const createdAt = input.paidAt ?? new Date().toISOString();
  const movement: NewMovement = {
    type: 'gasto',
    amount: input.amount,
    category: input.category,
    description: input.description,
    rawText: `[recurrente] ${input.description}`,
    sourceFundId: input.fundId,
    destinationFundId: null,
  };
  const error = validateMovement(movement);
  if (error) throw new Error(error);

  let movementId = 0;
  await db.withTransactionAsync(async () => {
    const occ = await db.getFirstAsync<{ status: string }>(
      'SELECT status FROM recurring_expense_occurrences WHERE id = ?',
      [input.occurrenceId]
    );
    if (!occ) throw new Error('La ocurrencia no existe.');
    if (occ.status === 'paid') throw new Error('Esta ocurrencia ya fue registrada.');

    const result = await db.runAsync(
      `INSERT INTO movements
         (type, amount, category, description, raw_text, source_fund_id, destination_fund_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movement.type,
        movement.amount,
        movement.category,
        movement.description,
        movement.rawText,
        movement.sourceFundId,
        movement.destinationFundId,
        createdAt,
      ]
    );
    movementId = result.lastInsertRowId;

    await db.runAsync(
      `UPDATE recurring_expense_occurrences
       SET status = 'paid', linked_movement_id = ?, updated_at = ?
       WHERE id = ?`,
      [movementId, new Date().toISOString(), input.occurrenceId]
    );
  });

  return movementId;
}

/**
 * Antes de eliminar un movimiento vinculado a una ocurrencia: desvincula y
 * vuelve la ocurrencia a pending. Devuelve el id de la ocurrencia afectada (o
 * null). Se usa para poder re-vincular al deshacer. Transaccional.
 */
export async function unlinkOccurrenceForMovement(
  db: SqlDatabase,
  movementId: number
): Promise<number | null> {
  const occ = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM recurring_expense_occurrences WHERE linked_movement_id = ?',
    [movementId]
  );
  if (!occ) return null;
  await db.runAsync(
    `UPDATE recurring_expense_occurrences
     SET status = 'pending', linked_movement_id = NULL, updated_at = ?
     WHERE id = ?`,
    [new Date().toISOString(), occ.id]
  );
  return occ.id;
}

/** Re-vincula una ocurrencia con un movimiento restaurado (deshacer): status → paid. */
export async function relinkOccurrence(
  db: SqlDatabase,
  occurrenceId: number,
  movementId: number
): Promise<void> {
  await db.runAsync(
    `UPDATE recurring_expense_occurrences
     SET status = 'paid', linked_movement_id = ?, updated_at = ?
     WHERE id = ?`,
    [movementId, new Date().toISOString(), occurrenceId]
  );
}

/**
 * Reconcilia ocurrencias cuyo movimiento vinculado fue eliminado sin pasar por
 * `unlinkOccurrenceForMovement` (la FK ON DELETE SET NULL dejó el link en NULL
 * pero el status quedó en 'paid'): las vuelve a 'pending'. Se llama al abrir el
 * calendario, sin necesidad de actualizar filas a diario.
 */
export async function reconcileOccurrences(db: SqlDatabase): Promise<void> {
  await db.runAsync(
    `UPDATE recurring_expense_occurrences
     SET status = 'pending', updated_at = ?
     WHERE status = 'paid' AND linked_movement_id IS NULL`,
    [new Date().toISOString()]
  );
}

/** Fecha local de hoy para precompletar el formulario de pago. */
export function defaultPaymentDate(now: Date = new Date()): string {
  return todayLocalDateString(now);
}
