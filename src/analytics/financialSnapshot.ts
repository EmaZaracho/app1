import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';
import type {
  AnalysisPeriodPreset,
  CategoryExpenseInsight,
  FinancialSnapshot,
} from '../types/financialAnalytics';
import { average, percentChange, round2, safeDivide } from '../domain/money';
import { getBudgets } from '../db/budgetsRepo';
import { getCategoryPriorities } from '../db/categoryFinancialSettingsRepository';
import { getSavingsGoal } from '../db/financialPreferencesRepository';
import type { SqlDatabase } from '../db/sqlDatabase';
import { resolvePeriod, type CustomRangeInput } from './periodRanges';
import { previousEquivalentRange, previousThreeEquivalentRanges } from './periodComparison';
import {
  getPeriodActiveDays,
  getPeriodActivity,
  getPeriodExpenseCategoryTotals,
  getPeriodFinancials,
} from './financialMetrics';
import { computeDataQuality } from './dataQuality';
import { computeSavingsGoalStatus } from './savingsGoalStatus';
import {
  computePotentialSavingsSummary,
  isDemandingMode,
  potentialSavingsForCategory,
  suggestedReductionPercentage,
} from './savingsPotential';
import { computeDeterministicFindings } from './deterministicFindings';

export interface BuildSnapshotOptions {
  preset: AnalysisPeriodPreset;
  custom?: CustomRangeInput;
  now?: Date;
}

/**
 * Orquesta el cálculo completo de un FinancialSnapshot: resuelve el período,
 * consulta métricas locales (actual, período anterior equivalente, promedio
 * de los 3 anteriores), aplica prioridades de categoría, calcula ahorro
 * potencial y hallazgos determinísticos. Todo el cálculo es local; ningún
 * valor viene de la IA.
 */
export async function buildFinancialSnapshot(
  db: SqlDatabase,
  options: BuildSnapshotOptions
): Promise<FinancialSnapshot> {
  const now = options.now ?? new Date();
  const period = resolvePeriod(options.preset, now, options.custom);
  const previousRange = previousEquivalentRange(period);
  const avgRanges = previousThreeEquivalentRanges(period);
  const isCurrentMonth = period.preset === 'current_month';

  const [
    current,
    previousFinancials,
    avgFinancialsList,
    categoryTotals,
    previousCategoryTotals,
    avgCategoryTotalsList,
    activity,
    activeDays,
    priorities,
    savingsGoalConfig,
    budgets,
  ] = await Promise.all([
    getPeriodFinancials(db, period),
    getPeriodFinancials(db, previousRange),
    Promise.all(avgRanges.map((r) => getPeriodFinancials(db, r))),
    getPeriodExpenseCategoryTotals(db, period),
    getPeriodExpenseCategoryTotals(db, previousRange),
    Promise.all(avgRanges.map((r) => getPeriodExpenseCategoryTotals(db, r))),
    getPeriodActivity(db, period),
    getPeriodActiveDays(db, period),
    getCategoryPriorities(db),
    getSavingsGoal(db),
    isCurrentMonth ? getBudgets(db) : Promise.resolve([]),
  ]);

  const previousPeriodsAverage = {
    income: round2(average(avgFinancialsList.map((f) => f.income))),
    expense: round2(average(avgFinancialsList.map((f) => f.expense))),
    operationalSavings: round2(average(avgFinancialsList.map((f) => f.operationalSavings))),
    savingsRate: safeDivide(
      average(avgFinancialsList.map((f) => f.income - f.expense)),
      average(avgFinancialsList.map((f) => f.income))
    ),
  };

  const historicalAvgByCategory = new Map<ExpenseCategory, number>();
  for (const cat of EXPENSE_CATEGORIES) {
    const values = avgCategoryTotalsList.map((list) => list.find((c) => c.category === cat)?.amount ?? 0);
    historicalAvgByCategory.set(cat, average(values));
  }

  const dataQuality = computeDataQuality(activity.movementCount, activeDays, period.days);

  const priorityByCategory = new Map(priorities.map((p) => [p.category, p.priority]));
  const budgetByCategory = new Map(budgets.map((b) => [b.category, b.monthlyLimit]));
  const previousTotalsByCategory = new Map(previousCategoryTotals.map((c) => [c.category, c.amount]));

  const savingsGoalStatus = computeSavingsGoalStatus(savingsGoalConfig, current.operationalSavings, current.income);

  const expenseChangePercentage = percentChange(current.expense, previousFinancials.expense);
  const categoryIncreases = categoryTotals.map((c) => ({
    changePercentage: percentChange(c.amount, previousTotalsByCategory.get(c.category) ?? 0),
    amount: c.amount,
  }));
  const budgetsExceeded = budgets.some(
    (b) => (categoryTotals.find((c) => c.category === b.category)?.amount ?? 0) > b.monthlyLimit
  );

  const demanding = isDemandingMode({
    operationalSavings: current.operationalSavings,
    savingsRate: current.savingsRate,
    savingsGoal: savingsGoalStatus,
    expenseChangePercentage,
    categoryIncreases,
    budgetsExceeded,
  });

  const totalExpense = current.expense;
  const categoryExpenses: CategoryExpenseInsight[] = categoryTotals.map((c) => {
    const priority = priorityByCategory.get(c.category)!;
    const previousAmount = previousTotalsByCategory.get(c.category) ?? 0;
    const historicalAverage = round2(historicalAvgByCategory.get(c.category) ?? 0);
    const currentBudget = isCurrentMonth ? budgetByCategory.get(c.category) ?? null : null;
    const budgetUsagePercentage =
      currentBudget != null && currentBudget > 0 ? round2((c.amount / currentBudget) * 100) : null;

    return {
      category: c.category,
      priority,
      amount: c.amount,
      percentageOfTotalExpenses: totalExpense > 0 ? round2((c.amount / totalExpense) * 100) : 0,
      previousPeriodAmount: previousAmount,
      previousPeriodChangePercentage: percentChange(c.amount, previousAmount),
      historicalAverageAmount: historicalAverage,
      historicalAverageChangePercentage: percentChange(c.amount, historicalAverage),
      currentBudget,
      budgetUsagePercentage,
      suggestedReductionPercentage: suggestedReductionPercentage(priority, demanding),
      potentialSavings: potentialSavingsForCategory(c.amount, priority, demanding),
    };
  });

  const potentialSavings = computePotentialSavingsSummary({
    categoryPotentialSavings: categoryExpenses.map((c) => c.potentialSavings),
    operationalSavings: current.operationalSavings,
    income: current.income,
    savingsGoal: savingsGoalStatus,
  });

  const deterministicFindings = computeDeterministicFindings({
    totals: current,
    savingsGoal: savingsGoalStatus,
    categoryExpenses,
    dataQuality,
  });

  return {
    period,
    dataQuality,
    totals: current,
    savingsGoal: savingsGoalStatus,
    activity,
    categoryExpenses,
    previousPeriod: {
      income: previousFinancials.income,
      expense: previousFinancials.expense,
      operationalSavings: previousFinancials.operationalSavings,
      savingsRate: previousFinancials.savingsRate,
    },
    previousPeriodsAverage,
    deterministicFindings,
    potentialSavings,
  };
}
