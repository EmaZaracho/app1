import type { SavingsGoal, SavingsGoalStatus } from '../types/financialAnalytics';
import { round2 } from '../domain/money';

/**
 * Calcula el estado de cumplimiento de la meta de ahorro para un período.
 * ahorro operativo = ingresos - gastos (ya viene calculado en `currentSavings`).
 */
export function computeSavingsGoalStatus(
  goal: SavingsGoal,
  currentSavings: number,
  periodIncome: number
): SavingsGoalStatus {
  if (!goal.enabled) {
    return {
      enabled: false,
      mode: null,
      configuredValue: null,
      targetAmount: null,
      currentAmount: currentSavings,
      remainingAmount: null,
      achievementPercentage: null,
      reached: null,
    };
  }

  const targetAmount =
    goal.mode === 'income_percentage' ? round2((periodIncome * goal.targetValue) / 100) : goal.targetValue;

  const reached = currentSavings >= targetAmount;
  const remainingAmount = reached ? 0 : round2(targetAmount - currentSavings);
  const achievementPercentage = targetAmount > 0 ? round2((currentSavings / targetAmount) * 100) : null;

  return {
    enabled: true,
    mode: goal.mode,
    configuredValue: goal.targetValue,
    targetAmount,
    currentAmount: currentSavings,
    remainingAmount,
    achievementPercentage,
    reached,
  };
}
