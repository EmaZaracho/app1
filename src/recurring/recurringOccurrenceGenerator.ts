import type { RecurringExpenseRule } from '../types/recurringExpenses';
import type { SqlDatabase } from '../db/sqlDatabase';
import { getRules } from '../db/recurringExpenseRulesRepository';
import { insertOccurrence } from '../db/recurringExpenseOccurrencesRepository';
import { compareDateStrings, scheduledDateFor } from './recurringDateUtils';

/**
 * Determina si una regla activa genera una ocurrencia para (year, month 0-based),
 * y con qué fecha efectiva. Devuelve null si no aplica.
 *
 * Aplica cuando: la fecha efectiva del mes es >= start_date (si el día ya pasó
 * respecto del inicio, la primera ocurrencia cae el mes siguiente) y, si hay
 * end_date, la fecha efectiva es <= end_date.
 */
export function occurrenceDateForRuleInMonth(
  rule: RecurringExpenseRule,
  year: number,
  month: number
): string | null {
  if (!rule.isActive) return null;
  const date = scheduledDateFor(year, month, rule.dayOfMonth);
  if (compareDateStrings(date, rule.startDate) < 0) return null;
  if (rule.endDate != null && compareDateStrings(date, rule.endDate) > 0) return null;
  return date;
}

/**
 * Crea únicamente las ocurrencias faltantes del mes (year, month 0-based).
 * Idempotente: no duplica ocurrencias existentes (UNIQUE rule_id+mes) ni pisa
 * estados/excepciones ya almacenados. Corre en una sola transacción.
 */
export async function ensureOccurrencesForMonth(
  db: SqlDatabase,
  year: number,
  month: number
): Promise<void> {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const rules = await getRules(db, { activeOnly: true });

  const existing = await db.getAllAsync<{ rule_id: number }>(
    'SELECT rule_id FROM recurring_expense_occurrences WHERE occurrence_month = ?',
    [monthKey]
  );
  const existingRuleIds = new Set(existing.map((e) => e.rule_id));

  const toCreate = rules
    .map((rule) => ({ rule, date: occurrenceDateForRuleInMonth(rule, year, month) }))
    .filter((x) => x.date != null && !existingRuleIds.has(x.rule.id));

  if (toCreate.length === 0) return;

  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    for (const { rule, date } of toCreate) {
      await insertOccurrence(
        db,
        {
          ruleId: rule.id,
          occurrenceMonth: monthKey,
          originalScheduledDate: date!,
          scheduledDate: date!,
          projectedAmount: rule.amountMode === 'unknown' ? null : rule.amount,
          category: rule.category,
          fundAssignmentMode: rule.fundAssignmentMode,
          fundId: rule.fundId,
        },
        now
      );
    }
  });
}
