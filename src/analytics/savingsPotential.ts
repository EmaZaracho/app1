import type { SavingsGoalStatus, SpendingPriority } from '../types/financialAnalytics';
import { round2 } from '../domain/money';

const NORMAL_REDUCTION = { flexible: 5, discretionary: 10 };
const DEMANDING_REDUCTION = { flexible: 10, discretionary: 20 };

// Umbrales documentados del modo exigente (heurísticas de producto):
const GOAL_ACHIEVEMENT_FAR_THRESHOLD = 50; // % de cumplimiento por debajo del cual se considera "lejos" de la meta
const EXPENSE_INCREASE_THRESHOLD_PCT = 20; // aumento total de gastos vs. período anterior
const CATEGORY_INCREASE_THRESHOLD_PCT = 25; // aumento de una categoría flexible/discrecional

export interface DemandingModeInputs {
  operationalSavings: number;
  savingsRate: number | null;
  savingsGoal: SavingsGoalStatus;
  /** % de cambio del gasto total vs. período anterior (null si no hay base). */
  expenseChangePercentage: number | null;
  categoryIncreases: { changePercentage: number | null; amount: number }[];
  budgetsExceeded: boolean;
}

/**
 * Determina si corresponde el modo exigente de reducción sugerida. Basta con
 * que se cumpla UNA de las condiciones documentadas.
 */
export function isDemandingMode(inputs: DemandingModeInputs): boolean {
  if (inputs.operationalSavings < 0) return true;
  if (inputs.savingsRate !== null && inputs.savingsRate < 0) return true;
  if (
    inputs.savingsGoal.enabled &&
    inputs.savingsGoal.achievementPercentage !== null &&
    inputs.savingsGoal.achievementPercentage < GOAL_ACHIEVEMENT_FAR_THRESHOLD
  ) {
    return true;
  }
  if (
    inputs.expenseChangePercentage !== null &&
    inputs.expenseChangePercentage >= EXPENSE_INCREASE_THRESHOLD_PCT
  ) {
    return true;
  }
  if (
    inputs.categoryIncreases.some(
      (c) => (c.changePercentage ?? 0) >= CATEGORY_INCREASE_THRESHOLD_PCT && c.amount > 0
    )
  ) {
    return true;
  }
  if (inputs.budgetsExceeded) return true;
  return false;
}

/** Categorías esenciales nunca reciben una reducción sugerida directa. */
export function suggestedReductionPercentage(priority: SpendingPriority, demanding: boolean): number {
  if (priority === 'essential') return 0;
  const table = demanding ? DEMANDING_REDUCTION : NORMAL_REDUCTION;
  return priority === 'flexible' ? table.flexible : table.discretionary;
}

export function potentialSavingsForCategory(
  amount: number,
  priority: SpendingPriority,
  demanding: boolean
): number {
  if (priority === 'essential' || amount <= 0) return 0;
  const pct = suggestedReductionPercentage(priority, demanding);
  return round2((amount * pct) / 100);
}

export interface PotentialSavingsInputs {
  categoryPotentialSavings: number[];
  operationalSavings: number;
  income: number;
  savingsGoal: SavingsGoalStatus;
}

export function computePotentialSavingsSummary(inputs: PotentialSavingsInputs) {
  const total = round2(inputs.categoryPotentialSavings.reduce((sum, v) => sum + v, 0));
  const projectedSavingsAfterReductions = round2(inputs.operationalSavings + total);
  const projectedSavingsRate = inputs.income > 0 ? projectedSavingsAfterReductions / inputs.income : null;
  const goalWouldBeReached =
    inputs.savingsGoal.enabled && inputs.savingsGoal.targetAmount != null
      ? projectedSavingsAfterReductions >= inputs.savingsGoal.targetAmount
      : null;
  return { total, projectedSavingsAfterReductions, projectedSavingsRate, goalWouldBeReached };
}
