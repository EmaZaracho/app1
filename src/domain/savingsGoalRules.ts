import type { SavingsGoalMode } from '../types/financialAnalytics';

/**
 * Valida el valor de una meta de ahorro. El valor debe ser finito y mayor a
 * 0; si el modo es porcentaje, además debe ser <= 100. Devuelve un mensaje de
 * error o null si es válido.
 */
export function validateSavingsGoalValue(mode: SavingsGoalMode, value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return 'El valor debe ser un número mayor a 0.';
  }
  if (mode === 'income_percentage' && value > 100) {
    return 'El porcentaje no puede ser mayor a 100.';
  }
  return null;
}
