import type { ExpenseCategory } from '../types';

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

export type AnalysisPeriodPreset =
  | 'current_month'
  | 'previous_month'
  | 'last_30_days'
  | 'last_3_months'
  | 'last_6_months'
  | 'custom';

export interface AnalysisPeriod {
  preset: AnalysisPeriodPreset;
  /** Instante ISO, inclusivo. */
  start: string;
  /** Instante ISO, EXCLUSIVO — coherente con el resto de las consultas de la app. */
  end: string;
  days: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Meta de ahorro
// ---------------------------------------------------------------------------

export type SavingsGoalMode = 'fixed_amount' | 'income_percentage';

export interface SavingsGoal {
  enabled: boolean;
  mode: SavingsGoalMode;
  targetValue: number;
}

export interface SavingsGoalStatus {
  enabled: boolean;
  mode: SavingsGoalMode | null;
  configuredValue: number | null;
  targetAmount: number | null;
  currentAmount: number;
  remainingAmount: number | null;
  achievementPercentage: number | null;
  reached: boolean | null;
}

// ---------------------------------------------------------------------------
// Clasificación de categorías
// ---------------------------------------------------------------------------

export type SpendingPriority = 'essential' | 'flexible' | 'discretionary';

// ---------------------------------------------------------------------------
// Calidad de datos
// ---------------------------------------------------------------------------

export type DataQualityLevel = 'insufficient' | 'limited' | 'sufficient';

export interface DataQuality {
  movementCount: number;
  activeDays: number;
  level: DataQualityLevel;
  message: string | null;
}

// ---------------------------------------------------------------------------
// Snapshot financiero
// ---------------------------------------------------------------------------

export interface PeriodFinancials {
  income: number;
  expense: number;
  operationalSavings: number;
  savingsRate: number | null;
}

export interface ActivityStats {
  movementCount: number;
  expenseCount: number;
  incomeCount: number;
  averageExpense: number;
  largestExpense: number;
}

export interface CategoryExpenseInsight {
  category: ExpenseCategory;
  priority: SpendingPriority;
  amount: number;
  percentageOfTotalExpenses: number;
  previousPeriodAmount: number;
  previousPeriodChangePercentage: number | null;
  historicalAverageAmount: number;
  historicalAverageChangePercentage: number | null;
  /** Solo se completa cuando el período coincide con el mes en curso (los presupuestos son mensuales). */
  currentBudget: number | null;
  budgetUsagePercentage: number | null;
  suggestedReductionPercentage: number;
  potentialSavings: number;
}

export type FindingSeverity = 'info' | 'warning' | 'critical';

export interface DeterministicFinding {
  code: string;
  severity: FindingSeverity;
  title: string;
  evidence: string;
  relatedCategory: ExpenseCategory | null;
}

export interface PotentialSavingsSummary {
  total: number;
  projectedSavingsAfterReductions: number;
  projectedSavingsRate: number | null;
  goalWouldBeReached: boolean | null;
}

export interface FinancialSnapshot {
  period: AnalysisPeriod;
  dataQuality: DataQuality;
  totals: PeriodFinancials & { adjustmentsNet: number };
  savingsGoal: SavingsGoalStatus;
  activity: ActivityStats;
  categoryExpenses: CategoryExpenseInsight[];
  previousPeriod: PeriodFinancials;
  previousPeriodsAverage: PeriodFinancials;
  deterministicFindings: DeterministicFinding[];
  potentialSavings: PotentialSavingsSummary;
}
