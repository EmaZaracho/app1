import type { ExpenseCategory } from '../types';
import type {
  AnalysisPeriod,
  CategoryExpenseInsight,
  DataQuality,
  DeterministicFinding,
  FinancialSnapshot,
  PeriodFinancials,
  PotentialSavingsSummary,
  SavingsGoalStatus,
} from './financialAnalytics';

/**
 * Versión reducida y agregada del snapshot que se envía a la IA. Nunca debe
 * incluir movimientos individuales, texto original, descripciones, ids ni
 * nombres/alias de fondos. Deliberadamente NO incluye `activity` del
 * snapshot completo (no aporta a la redacción y reduce superficie de datos).
 */
export interface FinancialAdviceInput {
  period: AnalysisPeriod;
  dataQuality: DataQuality;
  totals: PeriodFinancials & { adjustmentsNet: number };
  savingsGoal: SavingsGoalStatus;
  categoryExpenses: CategoryExpenseInsight[];
  previousPeriod: PeriodFinancials;
  previousPeriodsAverage: PeriodFinancials;
  deterministicFindings: DeterministicFinding[];
  potentialSavings: PotentialSavingsSummary;
}

/** Construye el payload reducido que se envía a la IA a partir del snapshot completo. */
export function buildAdviceInputFromSnapshot(snapshot: FinancialSnapshot): FinancialAdviceInput {
  return {
    period: snapshot.period,
    dataQuality: snapshot.dataQuality,
    totals: snapshot.totals,
    savingsGoal: snapshot.savingsGoal,
    categoryExpenses: snapshot.categoryExpenses,
    previousPeriod: snapshot.previousPeriod,
    previousPeriodsAverage: snapshot.previousPeriodsAverage,
    deterministicFindings: snapshot.deterministicFindings,
    potentialSavings: snapshot.potentialSavings,
  };
}

export type AdviceStatus = 'on_track' | 'attention' | 'action_required';
export type RecommendationPriority = 'high' | 'medium' | 'low';
export type RecommendationActionType =
  | 'create_budget'
  | 'configure_savings_goal'
  | 'view_movements'
  | 'none';

export interface AdviceStrength {
  title: string;
  evidence: string;
}

export interface AdviceRecommendation {
  /** Generado localmente al validar; nunca se confía en el id que devuelve la IA. */
  id: string;
  title: string;
  reason: string;
  action: string;
  priority: RecommendationPriority;
  relatedCategory: ExpenseCategory | null;
  suggestedReductionPercentage: number | null;
  potentialSavings: number | null;
  timeframe: string;
  actionType: RecommendationActionType;
  /** Solo local: no viene de la IA. */
  dismissed?: boolean;
}

export interface FinancialAdvice {
  summary: string;
  status: AdviceStatus;
  strengths: AdviceStrength[];
  recommendations: AdviceRecommendation[];
  dataQualityMessage: string | null;
  disclaimer: string;
}
