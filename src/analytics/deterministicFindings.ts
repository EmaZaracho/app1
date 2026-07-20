import type {
  CategoryExpenseInsight,
  DataQuality,
  DeterministicFinding,
  PeriodFinancials,
  SavingsGoalStatus,
} from '../types/financialAnalytics';
import { formatCurrency } from '../utils/format';

// Umbrales documentados (heurísticas de producto, no estadística formal):
const CATEGORY_INCREASE_THRESHOLD_PCT = 25; // "aumento fuerte" de una categoría vs. período anterior
const CATEGORY_INCREASE_MIN_AMOUNT = 1000; // piso en pesos: evita alertar por aumentos triviales
const CONCENTRATION_THRESHOLD_PCT = 40; // una categoría domina el gasto total
const BUDGET_NEAR_LIMIT_PCT = 80;
const LOW_SAVINGS_RATE_THRESHOLD = 0.1; // 10% de tasa de ahorro
const SIGNIFICANT_POTENTIAL_SAVINGS = 2000; // piso en pesos para señalar "oportunidad de reducción"

export interface FindingsInput {
  totals: PeriodFinancials;
  savingsGoal: SavingsGoalStatus;
  categoryExpenses: CategoryExpenseInsight[];
  dataQuality: DataQuality;
}

/**
 * Genera los hallazgos determinísticos (sin IA). Cada regla emite como
 * máximo un finding por concepto para no duplicar alertas del mismo problema
 * (p. ej. una única "oportunidad de reducción", no una por categoría).
 */
export function computeDeterministicFindings(input: FindingsInput): DeterministicFinding[] {
  const { totals, savingsGoal, categoryExpenses, dataQuality } = input;
  const findings: DeterministicFinding[] = [];

  // 1. Flujo negativo
  if (totals.expense > totals.income) {
    const deficit = totals.expense - totals.income;
    findings.push({
      code: 'negative_cash_flow',
      severity: 'critical',
      title: 'Gastaste más de lo que ingresó',
      evidence: `Tus gastos superaron tus ingresos en ${formatCurrency(deficit)} en este período.`,
      relatedCategory: null,
    });
  }

  // 2 / 3. Meta de ahorro
  if (savingsGoal.enabled) {
    if (savingsGoal.reached) {
      findings.push({
        code: 'savings_goal_reached',
        severity: 'info',
        title: 'Alcanzaste tu meta de ahorro',
        evidence: `Ahorraste ${formatCurrency(savingsGoal.currentAmount)}, superando tu meta de ${formatCurrency(
          savingsGoal.targetAmount ?? 0
        )}.`,
        relatedCategory: null,
      });
    } else if (savingsGoal.remainingAmount != null && savingsGoal.remainingAmount > 0) {
      findings.push({
        code: 'savings_goal_not_reached',
        severity: 'warning',
        title: 'Todavía no llegaste a tu meta de ahorro',
        evidence: `Te faltan ${formatCurrency(savingsGoal.remainingAmount)} para alcanzarla (cumpliste ${(
          savingsGoal.achievementPercentage ?? 0
        ).toFixed(0)}%).`,
        relatedCategory: null,
      });
    }
  }

  // 4. Categoría con aumento fuerte
  for (const c of categoryExpenses) {
    if (
      c.previousPeriodChangePercentage != null &&
      c.previousPeriodChangePercentage >= CATEGORY_INCREASE_THRESHOLD_PCT &&
      c.amount >= CATEGORY_INCREASE_MIN_AMOUNT
    ) {
      findings.push({
        code: 'category_spike',
        severity: 'warning',
        title: `${c.category} aumentó fuerte`,
        evidence: `${c.category} subió ${c.previousPeriodChangePercentage.toFixed(
          0
        )}% respecto al período anterior (${formatCurrency(c.amount)}).`,
        relatedCategory: c.category,
      });
    }
  }

  // 5. Categoría muy concentrada
  const dominant = categoryExpenses.find((c) => c.percentageOfTotalExpenses >= CONCENTRATION_THRESHOLD_PCT);
  if (dominant) {
    findings.push({
      code: 'category_concentration',
      severity: 'info',
      title: `${dominant.category} concentra gran parte de tu gasto`,
      evidence: `${dominant.category} representa el ${dominant.percentageOfTotalExpenses.toFixed(
        0
      )}% de tus gastos del período.`,
      relatedCategory: dominant.category,
    });
  }

  // 6 / 7. Presupuestos (solo disponibles cuando el período es el mes en curso)
  for (const c of categoryExpenses) {
    if (c.currentBudget == null || c.budgetUsagePercentage == null) continue;
    if (c.budgetUsagePercentage >= 100) {
      findings.push({
        code: 'budget_exceeded',
        severity: 'critical',
        title: `Superaste el presupuesto de ${c.category}`,
        evidence: `Gastaste ${formatCurrency(c.amount)} de un límite de ${formatCurrency(
          c.currentBudget
        )} (${c.budgetUsagePercentage.toFixed(0)}%).`,
        relatedCategory: c.category,
      });
    } else if (c.budgetUsagePercentage >= BUDGET_NEAR_LIMIT_PCT) {
      findings.push({
        code: 'budget_near_limit',
        severity: 'warning',
        title: `Estás cerca del límite de ${c.category}`,
        evidence: `Usaste el ${c.budgetUsagePercentage.toFixed(0)}% de tu presupuesto de ${c.category}.`,
        relatedCategory: c.category,
      });
    }
  }

  // 8. Tasa de ahorro baja (solo si no hay flujo negativo, que ya generó su propio finding)
  if (totals.savingsRate != null && totals.savingsRate >= 0 && totals.savingsRate < LOW_SAVINGS_RATE_THRESHOLD) {
    findings.push({
      code: 'low_savings_rate',
      severity: 'warning',
      title: 'Tu tasa de ahorro es baja',
      evidence: `Ahorraste el ${(totals.savingsRate * 100).toFixed(0)}% de tus ingresos en el período.`,
      relatedCategory: null,
    });
  }

  // 9. Oportunidad de reducción (la mejor única, no una por categoría)
  const bestOpportunity = [...categoryExpenses]
    .filter((c) => c.priority !== 'essential' && c.potentialSavings >= SIGNIFICANT_POTENTIAL_SAVINGS)
    .sort((a, b) => b.potentialSavings - a.potentialSavings)[0];
  if (bestOpportunity) {
    findings.push({
      code: 'reduction_opportunity',
      severity: 'info',
      title: `Oportunidad en ${bestOpportunity.category}`,
      evidence: `Reducir ${bestOpportunity.category} un ${
        bestOpportunity.suggestedReductionPercentage
      }% liberaría hasta ${formatCurrency(bestOpportunity.potentialSavings)}.`,
      relatedCategory: bestOpportunity.category,
    });
  }

  // 10. Calidad de datos
  if (dataQuality.level !== 'sufficient' && dataQuality.message) {
    findings.push({
      code: dataQuality.level === 'insufficient' ? 'insufficient_data' : 'limited_data',
      severity: dataQuality.level === 'insufficient' ? 'critical' : 'info',
      title: dataQuality.level === 'insufficient' ? 'Datos insuficientes' : 'Datos limitados',
      evidence: dataQuality.message,
      relatedCategory: null,
    });
  }

  return findings;
}
