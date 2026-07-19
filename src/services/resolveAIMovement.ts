import { resolveFundReference, type FundMatchTarget } from '../domain/fundMatching';
import type { AIMovementType, Category } from '../types';
import type { AIMovementResponse } from './aiTypes';

export interface ResolvedAIMovement {
  type: AIMovementType;
  amount: number;
  category: Category | null;
  description: string;
  /** Fondo de origen resuelto localmente contra nombres/alias, o null. */
  sourceFundId: number | null;
  destinationFundId: number | null;
}

/**
 * Resuelve los nombres de fondos que devolvió la IA contra los fondos reales,
 * usando matching normalizado. Si un nombre no matchea o es ambiguo, queda en
 * null para que la vista previa lo pregunte. La IA nunca aporta ids confiables.
 */
export function resolveAIMovement(
  ai: AIMovementResponse,
  targets: FundMatchTarget[]
): ResolvedAIMovement {
  const resolveOne = (name: string | null): number | null => {
    const result = resolveFundReference(name, targets);
    return result.status === 'matched' ? result.fundId : null;
  };
  return {
    type: ai.type,
    amount: ai.amount,
    category: ai.category as Category | null,
    description: ai.description,
    sourceFundId: resolveOne(ai.sourceFund),
    destinationFundId: resolveOne(ai.destinationFund),
  };
}
