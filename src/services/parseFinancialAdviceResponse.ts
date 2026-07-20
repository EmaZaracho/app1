import type { FinancialAdviceInput } from '../types/financialAdvice';
import type {
  AdviceRecommendation,
  AdviceStatus,
  FinancialAdvice,
  RecommendationActionType,
  RecommendationPriority,
} from '../types/financialAdvice';
import { AIProviderError } from './aiErrors';

const STATUSES: AdviceStatus[] = ['on_track', 'attention', 'action_required'];
const PRIORITIES: RecommendationPriority[] = ['high', 'medium', 'low'];
const ACTION_TYPES: RecommendationActionType[] = [
  'create_budget',
  'configure_savings_goal',
  'view_movements',
  'none',
];
const MAX_RECOMMENDATIONS = 3;

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Valida ESTRICTAMENTE la respuesta cruda de la IA contra el input local ya
 * calculado. Nunca confía en JSON.parse a secas: cada campo se valida y, si
 * la IA propone un porcentaje/ahorro potencial numérico para una categoría,
 * se reemplaza por el valor local exacto (o se descarta la recomendación si
 * no se puede reconciliar de forma inequívoca).
 */
export function parseFinancialAdviceResponse(
  content: string,
  input: FinancialAdviceInput
): FinancialAdvice {
  let raw: any;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AIProviderError('No se pudo interpretar la respuesta de la IA.');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AIProviderError('Respuesta de la IA con formato inválido.');
  }

  const summary = nonEmptyString(raw.summary);
  const disclaimer = nonEmptyString(raw.disclaimer);
  if (!summary || !disclaimer) {
    throw new AIProviderError('La respuesta de la IA no tiene el formato esperado.');
  }
  const status: AdviceStatus = STATUSES.includes(raw.status) ? raw.status : 'attention';

  const strengths = Array.isArray(raw.strengths)
    ? raw.strengths
        .map((s: any) => ({ title: nonEmptyString(s?.title), evidence: nonEmptyString(s?.evidence) }))
        .filter(
          (s: { title: string | null; evidence: string | null }): s is { title: string; evidence: string } =>
            !!s.title && !!s.evidence
        )
    : [];

  const categoryByName = new Map(input.categoryExpenses.map((c) => [c.category as string, c]));
  const rawRecommendations = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const recommendations: AdviceRecommendation[] = [];

  for (const item of rawRecommendations) {
    if (recommendations.length >= MAX_RECOMMENDATIONS) break;

    const title = nonEmptyString(item?.title);
    const reason = nonEmptyString(item?.reason);
    const action = nonEmptyString(item?.action);
    const timeframe = nonEmptyString(item?.timeframe) ?? 'Este período';
    const priority: RecommendationPriority | null = PRIORITIES.includes(item?.priority) ? item.priority : null;
    const actionType: RecommendationActionType = ACTION_TYPES.includes(item?.actionType)
      ? item.actionType
      : 'none';

    // Campos obligatorios inválidos: descartar esta recomendación puntual.
    if (!title || !reason || !action || !priority) continue;

    let relatedCategory: string | null = null;
    if (typeof item?.relatedCategory === 'string' && categoryByName.has(item.relatedCategory)) {
      relatedCategory = item.relatedCategory;
    }

    let suggestedReductionPercentage: number | null = null;
    let potentialSavings: number | null = null;

    if (relatedCategory) {
      // Categoría inequívoca: SIEMPRE se reemplaza por el valor local exacto,
      // sin importar qué haya devuelto la IA.
      const local = categoryByName.get(relatedCategory)!;
      suggestedReductionPercentage = local.suggestedReductionPercentage;
      potentialSavings = local.potentialSavings;
    } else {
      const claimedPercentage = item?.suggestedReductionPercentage != null;
      const claimedSavings = item?.potentialSavings != null;
      if (claimedPercentage || claimedSavings) {
        // La IA reclama un número que no se puede reconciliar contra una
        // categoría real: se descarta la recomendación completa.
        continue;
      }
    }

    recommendations.push({
      id: `rec-${recommendations.length + 1}`,
      title,
      reason,
      action,
      priority,
      relatedCategory: relatedCategory as AdviceRecommendation['relatedCategory'],
      suggestedReductionPercentage,
      potentialSavings,
      timeframe,
      actionType,
    });
  }

  return {
    summary,
    status,
    strengths,
    recommendations,
    dataQualityMessage: nonEmptyString(raw.dataQualityMessage),
    disclaimer,
  };
}
