import { round2 } from '../domain/money';
import {
  firstNegativeDate,
  summarizeMonth,
  type FundPendingOccurrence,
  type OccurrenceSummaryInput,
} from '../recurring/recurringProjection';
import type {
  BudgetProjection,
  FundProjection,
  MonthlyProjectionSummary,
} from '../types/recurringExpenses';
import { getFundBalances } from './balances';
import { getBudgets } from './budgetsRepo';
import { getOccurrencesForMonth } from './recurringExpenseOccurrencesRepository';
import { getCurrentMonthExpenseCategoryTotals } from './summaryRepo';
import type { SqlDatabase } from './sqlDatabase';

/** Monto real del movimiento vinculado a cada ocurrencia paga del mes. */
async function realAmountsByOccurrence(
  db: SqlDatabase,
  monthKey: string
): Promise<Map<number, number>> {
  const rows = await db.getAllAsync<{ id: number; amount: number }>(
    `SELECT o.id AS id, m.amount AS amount
     FROM recurring_expense_occurrences o
     JOIN movements m ON m.id = o.linked_movement_id
     WHERE o.occurrence_month = ?`,
    [monthKey]
  );
  return new Map(rows.map((r) => [r.id, r.amount]));
}

export async function getMonthlyProjection(
  db: SqlDatabase,
  monthKey: string,
  now: Date = new Date()
): Promise<MonthlyProjectionSummary> {
  const [occurrences, realAmounts] = await Promise.all([
    getOccurrencesForMonth(db, monthKey, now),
    realAmountsByOccurrence(db, monthKey),
  ]);
  const inputs: OccurrenceSummaryInput[] = occurrences.map((o) => ({
    effectiveStatus: o.effectiveStatus,
    projectedAmount: o.projectedAmount,
    paidActualAmount: o.linkedMovementId != null ? realAmounts.get(o.id) ?? null : null,
  }));
  return summarizeMonth(inputs);
}

/**
 * Proyección por fondo: saldo real, gastos pendientes conocidos con fondo fijo,
 * saldo proyectado y fecha en que quedaría negativo dentro del mes. Los gastos
 * ask_on_payment NO se atribuyen a ningún fondo.
 */
export async function getFundProjections(
  db: SqlDatabase,
  monthKey: string,
  now: Date = new Date()
): Promise<FundProjection[]> {
  const [occurrences, balances, funds] = await Promise.all([
    getOccurrencesForMonth(db, monthKey, now),
    getFundBalances(db),
    db.getAllAsync<{ id: number; name: string }>(
      'SELECT id, name FROM funds WHERE is_archived = 0 ORDER BY is_default DESC, display_order, id'
    ),
  ]);
  const balanceById = new Map(balances.map((b) => [b.id, b.balance]));

  const pendingByFund = new Map<number, FundPendingOccurrence[]>();
  for (const occ of occurrences) {
    const isPending = occ.effectiveStatus === 'pending' || occ.effectiveStatus === 'overdue';
    if (!isPending) continue;
    if (occ.fundAssignmentMode !== 'fixed' || occ.fundId == null || occ.projectedAmount == null) continue;
    const list = pendingByFund.get(occ.fundId) ?? [];
    list.push({ scheduledDate: occ.scheduledDate, projectedAmount: occ.projectedAmount });
    pendingByFund.set(occ.fundId, list);
  }

  return funds.map((fund) => {
    const realBalance = balanceById.get(fund.id) ?? 0;
    const pending = pendingByFund.get(fund.id) ?? [];
    const pendingKnownExpenses = round2(pending.reduce((sum, p) => sum + p.projectedAmount, 0));
    return {
      fundId: fund.id,
      fundName: fund.name,
      realBalance,
      pendingKnownExpenses,
      projectedBalance: round2(realBalance - pendingKnownExpenses),
      goesNegativeOn: firstNegativeDate(realBalance, pending),
    };
  });
}

/**
 * Proyección de presupuestos: gasto real + proyectado pendiente por categoría.
 * NO modifica el gasto real ni activa alertas reales; solo advierte por
 * proyección. Solo aplica cuando `monthKey` es el mes en curso (los
 * presupuestos y el gasto real son mensuales).
 */
export async function getBudgetProjections(
  db: SqlDatabase,
  monthKey: string,
  now: Date = new Date()
): Promise<BudgetProjection[]> {
  const [budgets, spentTotals, occurrences] = await Promise.all([
    getBudgets(db),
    getCurrentMonthExpenseCategoryTotals(db),
    getOccurrencesForMonth(db, monthKey, now),
  ]);
  const spentByCategory = new Map(spentTotals.map((t) => [t.category, t.total]));

  const projectedByCategory = new Map<string, number>();
  for (const occ of occurrences) {
    const isPending = occ.effectiveStatus === 'pending' || occ.effectiveStatus === 'overdue';
    if (!isPending || occ.projectedAmount == null) continue;
    projectedByCategory.set(
      occ.category,
      (projectedByCategory.get(occ.category) ?? 0) + occ.projectedAmount
    );
  }

  return budgets.map((budget) => {
    const spent = spentByCategory.get(budget.category) ?? 0;
    const projectedPending = round2(projectedByCategory.get(budget.category) ?? 0);
    const possibleTotal = round2(spent + projectedPending);
    return {
      category: budget.category,
      spent,
      projectedPending,
      possibleTotal,
      budget: budget.monthlyLimit,
      projectedOverBy: possibleTotal > budget.monthlyLimit ? round2(possibleTotal - budget.monthlyLimit) : 0,
    };
  });
}
