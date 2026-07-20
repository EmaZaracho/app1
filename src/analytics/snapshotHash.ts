import type { FinancialSnapshot, SavingsGoal, SpendingPriority } from '../types/financialAnalytics';

/**
 * Hash determinístico (no criptográfico) del snapshot + la configuración que
 * lo afecta, usado para saber si el análisis en caché sigue vigente. NUNCA
 * incluye la API key.
 */
export function computeSnapshotHash(
  snapshot: FinancialSnapshot,
  provider: string,
  categoryPriorities: Record<string, SpendingPriority>,
  savingsGoal: SavingsGoal
): string {
  const payload = JSON.stringify({
    period: snapshot.period,
    totals: snapshot.totals,
    savingsGoal: snapshot.savingsGoal,
    categoryExpenses: snapshot.categoryExpenses,
    previousPeriod: snapshot.previousPeriod,
    previousPeriodsAverage: snapshot.previousPeriodsAverage,
    provider,
    categoryPriorities,
    goalConfig: savingsGoal,
  });
  return fnv1a(payload);
}

/**
 * FNV-1a de 32 bits: determinístico, sin dependencias nuevas, suficiente
 * para invalidar una caché local (no se usa con fines de seguridad).
 */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
