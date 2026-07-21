import { computeEffectiveStatus } from '../recurring/recurringStatus';
import { todayLocalDateString } from '../recurring/recurringDateUtils';
import type { ExpenseCategory } from '../types';
import type {
  FundAssignmentMode,
  RecurringExpenseOccurrence,
  StoredOccurrenceStatus,
} from '../types/recurringExpenses';
import type { SqlDatabase } from './sqlDatabase';

interface OccurrenceRow {
  id: number;
  rule_id: number;
  occurrence_month: string;
  original_scheduled_date: string;
  scheduled_date: string;
  projected_amount: number | null;
  category: string;
  fund_assignment_mode: string;
  fund_id: number | null;
  status: string;
  linked_movement_id: number | null;
  is_manually_modified: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToOccurrence(row: OccurrenceRow, today: string): RecurringExpenseOccurrence {
  const storedStatus = row.status as StoredOccurrenceStatus;
  return {
    id: row.id,
    ruleId: row.rule_id,
    occurrenceMonth: row.occurrence_month,
    originalScheduledDate: row.original_scheduled_date,
    scheduledDate: row.scheduled_date,
    projectedAmount: row.projected_amount,
    category: row.category as ExpenseCategory,
    fundAssignmentMode: row.fund_assignment_mode as FundAssignmentMode,
    fundId: row.fund_id,
    storedStatus,
    effectiveStatus: computeEffectiveStatus(storedStatus, row.scheduled_date, today),
    linkedMovementId: row.linked_movement_id,
    isManuallyModified: row.is_manually_modified === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOccurrencesForMonth(
  db: SqlDatabase,
  monthKey: string,
  now: Date = new Date()
): Promise<RecurringExpenseOccurrence[]> {
  const today = todayLocalDateString(now);
  const rows = await db.getAllAsync<OccurrenceRow>(
    `SELECT * FROM recurring_expense_occurrences
     WHERE occurrence_month = ? AND status <> 'deleted'
     ORDER BY scheduled_date, id`,
    [monthKey]
  );
  return rows.map((r) => rowToOccurrence(r, today));
}

export async function getOccurrenceById(
  db: SqlDatabase,
  id: number,
  now: Date = new Date()
): Promise<RecurringExpenseOccurrence | null> {
  const row = await db.getFirstAsync<OccurrenceRow>(
    "SELECT * FROM recurring_expense_occurrences WHERE id = ? AND status <> 'deleted'",
    [id]
  );
  return row ? rowToOccurrence(row, todayLocalDateString(now)) : null;
}

export async function getOccurrencesForRule(
  db: SqlDatabase,
  ruleId: number,
  now: Date = new Date()
): Promise<RecurringExpenseOccurrence[]> {
  const today = todayLocalDateString(now);
  const rows = await db.getAllAsync<OccurrenceRow>(
    `SELECT * FROM recurring_expense_occurrences
     WHERE rule_id = ? AND status <> 'deleted'
     ORDER BY occurrence_month DESC`,
    [ruleId]
  );
  return rows.map((r) => rowToOccurrence(r, today));
}

export async function getOccurrenceByLinkedMovement(
  db: SqlDatabase,
  movementId: number,
  now: Date = new Date()
): Promise<RecurringExpenseOccurrence | null> {
  const row = await db.getFirstAsync<OccurrenceRow>(
    'SELECT * FROM recurring_expense_occurrences WHERE linked_movement_id = ?',
    [movementId]
  );
  return row ? rowToOccurrence(row, todayLocalDateString(now)) : null;
}

export interface NewOccurrence {
  ruleId: number;
  occurrenceMonth: string;
  originalScheduledDate: string;
  scheduledDate: string;
  projectedAmount: number | null;
  category: ExpenseCategory;
  fundAssignmentMode: FundAssignmentMode;
  fundId: number | null;
}

/** Inserta una ocurrencia (status inicial pending). */
export async function insertOccurrence(
  db: SqlDatabase,
  occ: NewOccurrence,
  now: string = new Date().toISOString()
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recurring_expense_occurrences
       (rule_id, occurrence_month, original_scheduled_date, scheduled_date, projected_amount,
        category, fund_assignment_mode, fund_id, status, linked_movement_id, is_manually_modified,
        notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 0, NULL, ?, ?)`,
    [
      occ.ruleId,
      occ.occurrenceMonth,
      occ.originalScheduledDate,
      occ.scheduledDate,
      occ.projectedAmount,
      occ.category,
      occ.fundAssignmentMode,
      occ.fundId,
      now,
      now,
    ]
  );
  return result.lastInsertRowId;
}

export async function setOccurrenceStatus(
  db: SqlDatabase,
  id: number,
  status: StoredOccurrenceStatus
): Promise<void> {
  await db.runAsync('UPDATE recurring_expense_occurrences SET status = ?, updated_at = ? WHERE id = ?', [
    status,
    new Date().toISOString(),
    id,
  ]);
}

/**
 * Reprograma solo esta ocurrencia (conserva original_scheduled_date y el mes
 * ancla occurrence_month, para no romper la idempotencia de la generación).
 */
export async function rescheduleOccurrence(db: SqlDatabase, id: number, newDate: string): Promise<void> {
  await db.runAsync(
    `UPDATE recurring_expense_occurrences
     SET scheduled_date = ?, is_manually_modified = 1, updated_at = ?
     WHERE id = ?`,
    [newDate, new Date().toISOString(), id]
  );
}

export interface OccurrenceEditableFields {
  projectedAmount: number | null;
  category: ExpenseCategory;
  fundAssignmentMode: FundAssignmentMode;
  fundId: number | null;
  scheduledDate: string;
  notes: string | null;
}

/** Edita solo esta ocurrencia y la marca como modificada manualmente. */
export async function updateOccurrenceFields(
  db: SqlDatabase,
  id: number,
  fields: OccurrenceEditableFields
): Promise<void> {
  await db.runAsync(
    `UPDATE recurring_expense_occurrences
     SET projected_amount = ?, category = ?, fund_assignment_mode = ?, fund_id = ?,
         scheduled_date = ?, notes = ?, is_manually_modified = 1, updated_at = ?
     WHERE id = ?`,
    [
      fields.projectedAmount,
      fields.category,
      fields.fundAssignmentMode,
      fields.fundId,
      fields.scheduledDate,
      fields.notes,
      new Date().toISOString(),
      id,
    ]
  );
}

/** Ocurrencias futuras pending NO modificadas manualmente de una regla, desde un mes (inclusive). */
export async function getFuturePendingUnmodified(
  db: SqlDatabase,
  ruleId: number,
  fromMonth: string,
  now: Date = new Date()
): Promise<RecurringExpenseOccurrence[]> {
  const today = todayLocalDateString(now);
  const rows = await db.getAllAsync<OccurrenceRow>(
    `SELECT * FROM recurring_expense_occurrences
     WHERE rule_id = ? AND occurrence_month >= ? AND status = 'pending' AND is_manually_modified = 0`,
    [ruleId, fromMonth]
  );
  return rows.map((r) => rowToOccurrence(r, today));
}

/**
 * Marca la ocurrencia como eliminada (tombstone: status='deleted') en vez de
 * borrar la fila. Si se borrara de verdad, ensureOccurrencesForMonth la
 * regeneraría en la próxima carga del calendario, ya que solo verifica
 * existencia de fila por (rule_id, occurrence_month).
 */
export async function deleteOccurrence(db: SqlDatabase, id: number): Promise<void> {
  await db.runAsync("UPDATE recurring_expense_occurrences SET status = 'deleted', updated_at = ? WHERE id = ?", [
    new Date().toISOString(),
    id,
  ]);
}
