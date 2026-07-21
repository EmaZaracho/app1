import { validateRecurringRule } from '../recurring/recurringValidation';
import type { ExpenseCategory } from '../types';
import type {
  FundAssignmentMode,
  RecurringAmountMode,
  RecurringExpenseRule,
  RecurringRuleInput,
} from '../types/recurringExpenses';
import type { SqlDatabase } from './sqlDatabase';

interface RuleRow {
  id: number;
  name: string;
  description: string | null;
  category: string;
  amount_mode: string;
  amount: number | null;
  fund_assignment_mode: string;
  fund_id: number | null;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToRule(row: RuleRow): RecurringExpenseRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as ExpenseCategory,
    amountMode: row.amount_mode as RecurringAmountMode,
    amount: row.amount,
    fundAssignmentMode: row.fund_assignment_mode as FundAssignmentMode,
    fundId: row.fund_id,
    dayOfMonth: row.day_of_month,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertFundNotArchived(db: SqlDatabase, fundId: number | null): Promise<void> {
  if (fundId == null) return;
  const row = await db.getFirstAsync<{ is_archived: number }>(
    'SELECT is_archived FROM funds WHERE id = ?',
    [fundId]
  );
  if (!row) throw new Error('El fondo seleccionado no existe.');
  if (row.is_archived === 1) {
    throw new Error('No podés usar un fondo archivado para una regla recurrente.');
  }
}

export async function getRules(
  db: SqlDatabase,
  options: { activeOnly?: boolean } = {}
): Promise<RecurringExpenseRule[]> {
  const where = options.activeOnly ? 'WHERE is_active = 1' : '';
  const rows = await db.getAllAsync<RuleRow>(
    `SELECT * FROM recurring_expense_rules ${where} ORDER BY name COLLATE NOCASE`
  );
  return rows.map(rowToRule);
}

export async function getRuleById(db: SqlDatabase, id: number): Promise<RecurringExpenseRule | null> {
  const row = await db.getFirstAsync<RuleRow>('SELECT * FROM recurring_expense_rules WHERE id = ?', [id]);
  return row ? rowToRule(row) : null;
}

/** Inserta una regla validando invariantes y que el fondo no esté archivado. */
export async function insertRule(
  db: SqlDatabase,
  input: RecurringRuleInput,
  now: string = new Date().toISOString()
): Promise<number> {
  const error = validateRecurringRule(input);
  if (error) throw new Error(error);
  await assertFundNotArchived(db, input.fundId);

  const result = await db.runAsync(
    `INSERT INTO recurring_expense_rules
       (name, description, category, amount_mode, amount, fund_assignment_mode, fund_id,
        day_of_month, start_date, end_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name.trim(),
      input.description,
      input.category,
      input.amountMode,
      input.amount,
      input.fundAssignmentMode,
      input.fundId,
      input.dayOfMonth,
      input.startDate,
      input.endDate,
      input.isActive ? 1 : 0,
      now,
      now,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateRule(
  db: SqlDatabase,
  id: number,
  input: RecurringRuleInput,
  now: string = new Date().toISOString()
): Promise<void> {
  const error = validateRecurringRule(input);
  if (error) throw new Error(error);
  await assertFundNotArchived(db, input.fundId);

  await db.runAsync(
    `UPDATE recurring_expense_rules SET
       name = ?, description = ?, category = ?, amount_mode = ?, amount = ?,
       fund_assignment_mode = ?, fund_id = ?, day_of_month = ?, start_date = ?, end_date = ?,
       is_active = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name.trim(),
      input.description,
      input.category,
      input.amountMode,
      input.amount,
      input.fundAssignmentMode,
      input.fundId,
      input.dayOfMonth,
      input.startDate,
      input.endDate,
      input.isActive ? 1 : 0,
      now,
      id,
    ]
  );
}

export async function setRuleActive(db: SqlDatabase, id: number, active: boolean): Promise<void> {
  await db.runAsync('UPDATE recurring_expense_rules SET is_active = ?, updated_at = ? WHERE id = ?', [
    active ? 1 : 0,
    new Date().toISOString(),
    id,
  ]);
}

/** Termina una regla poniéndole una fecha final (para "esta y las siguientes"). */
export async function setRuleEndDate(db: SqlDatabase, id: number, endDate: string): Promise<void> {
  await db.runAsync('UPDATE recurring_expense_rules SET end_date = ?, updated_at = ? WHERE id = ?', [
    endDate,
    new Date().toISOString(),
    id,
  ]);
}

export async function countOccurrencesForRule(db: SqlDatabase, ruleId: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) as n FROM recurring_expense_occurrences WHERE rule_id = ?',
    [ruleId]
  );
  return row?.n ?? 0;
}

/**
 * Elimina físicamente una regla solo si no tiene ocurrencias. Si tiene
 * historial, hay que desactivarla en su lugar (la FK ON DELETE RESTRICT
 * también lo impediría).
 */
export async function deleteRule(db: SqlDatabase, id: number): Promise<void> {
  const count = await countOccurrencesForRule(db, id);
  if (count > 0) {
    throw new Error('La regla tiene ocurrencias. Desactivala en lugar de eliminarla.');
  }
  await db.runAsync('DELETE FROM recurring_expense_rules WHERE id = ?', [id]);
}
