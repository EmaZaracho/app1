import type { RecurringRuleInput } from '../types/recurringExpenses';
import type { SqlDatabase } from '../db/sqlDatabase';
import {
  getRuleById,
  insertRule,
  setRuleEndDate,
  updateRule,
} from '../db/recurringExpenseRulesRepository';
import {
  deleteOccurrence,
  getFuturePendingUnmodified,
  getOccurrenceById,
} from '../db/recurringExpenseOccurrencesRepository';
import { ensureOccurrencesForMonth } from './recurringOccurrenceGenerator';
import {
  daysInMonth,
  monthBounds,
  parseMonthKey,
  scheduledDateFor,
  shiftMonthKey,
  toLocalDateString,
} from './recurringDateUtils';

/**
 * "Toda la serie": modifica la regla base y actualiza las ocurrencias futuras
 * pending NO modificadas manualmente (desde `fromMonth`, inclusive). Nunca toca
 * ocurrencias pagadas, omitidas, canceladas ni excepciones manuales.
 */
export async function editWholeSeries(
  db: SqlDatabase,
  ruleId: number,
  input: RecurringRuleInput,
  fromMonth: string
): Promise<void> {
  await updateRule(db, ruleId, input);
  const future = await getFuturePendingUnmodified(db, ruleId, fromMonth);
  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    for (const occ of future) {
      const { year, month } = parseMonthKey(occ.occurrenceMonth);
      const newDate = scheduledDateFor(year, month, input.dayOfMonth);
      await db.runAsync(
        `UPDATE recurring_expense_occurrences
         SET projected_amount = ?, category = ?, fund_assignment_mode = ?, fund_id = ?,
             scheduled_date = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.amountMode === 'unknown' ? null : input.amount,
          input.category,
          input.fundAssignmentMode,
          input.fundId,
          newDate,
          now,
          occ.id,
        ]
      );
    }
  });
}

/**
 * "Esta y las siguientes": conserva la historia previa intacta, finaliza la
 * regla original antes de `fromMonth` y crea una regla nueva con la config
 * modificada aplicable desde ese mes. Regenera las ocurrencias futuras pending
 * NO modificadas ya materializadas del mes en adelante. Transaccional.
 */
export async function editThisAndFollowing(
  db: SqlDatabase,
  ruleId: number,
  fromMonth: string,
  input: RecurringRuleInput
): Promise<number> {
  const original = await getRuleById(db, ruleId);
  if (!original) throw new Error('La regla no existe.');

  // Fecha de corte: último día del mes anterior a fromMonth.
  const prevMonth = shiftMonthKey(fromMonth, -1);
  const { year: py, month: pm } = parseMonthKey(prevMonth);
  const cutoffEnd = toLocalDateString(new Date(py, pm, daysInMonth(py, pm)));

  // Inicio de la regla nueva: primer día de fromMonth (o start original si es posterior).
  const from = parseMonthKey(fromMonth);
  const { first: fromMonthFirst } = monthBounds(from.year, from.month);
  const newStart =
    input.startDate && input.startDate > fromMonthFirst ? input.startDate : fromMonthFirst;

  const future = await getFuturePendingUnmodified(db, ruleId, fromMonth);

  let newRuleId = 0;
  await db.withTransactionAsync(async () => {
    // 1. Finalizar la regla original antes del mes seleccionado.
    await setRuleEndDate(db, ruleId, cutoffEnd);
    // 2. Crear la regla nueva desde fromMonth.
    newRuleId = await insertRule(db, { ...input, startDate: newStart });
    // 3. Borrar ocurrencias futuras pending no modificadas de la regla vieja
    //    (se regenerarán bajo la regla nueva). Se conservan paid/skipped/cancelled/manual.
    for (const occ of future) {
      await deleteOccurrence(db, occ.id);
    }
  });

  // 4. Materializar la ocurrencia de la regla nueva para el mes abierto
  //    (fuera de la transacción anterior: ensureOccurrencesForMonth abre la suya).
  const { year, month } = parseMonthKey(fromMonth);
  await ensureOccurrencesForMonth(db, year, month);

  return newRuleId;
}

/**
 * Elimina una ocurrencia y todas las de la misma regla desde ese mes en
 * adelante (inclusive): termina la regla en el mes anterior (no genera más
 * ocurrencias futuras) y borra las ya materializadas de ahí en más, salvo las
 * pagadas. El historial previo a ese mes queda intacto.
 */
export async function deleteOccurrenceAndFollowing(db: SqlDatabase, occurrenceId: number): Promise<void> {
  const occ = await getOccurrenceById(db, occurrenceId);
  if (!occ) return;
  const rule = await getRuleById(db, occ.ruleId);
  if (!rule) return;

  const prevMonth = shiftMonthKey(occ.occurrenceMonth, -1);
  const { year: py, month: pm } = parseMonthKey(prevMonth);
  const candidateCutoff = toLocalDateString(new Date(py, pm, daysInMonth(py, pm)));
  const cutoffEnd = candidateCutoff < rule.startDate ? rule.startDate : candidateCutoff;

  await db.withTransactionAsync(async () => {
    await setRuleEndDate(db, rule.id, cutoffEnd);
    await db.runAsync(
      `UPDATE recurring_expense_occurrences
       SET status = 'deleted', updated_at = ?
       WHERE rule_id = ? AND occurrence_month >= ? AND status <> 'paid'`,
      [new Date().toISOString(), rule.id, occ.occurrenceMonth]
    );
  });
}
