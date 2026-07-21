import { isValidCategoryForType } from '../types';
import type { RecurringRuleInput } from '../types/recurringExpenses';
import { compareDateStrings } from './recurringDateUtils';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida una regla recurrente. Devuelve un mensaje de error (en español) o
 * null si es válida. Las mismas reglas se aplican en el dominio y en la UI.
 */
export function validateRecurringRule(input: RecurringRuleInput): string | null {
  if (!input.name.trim()) return 'El nombre no puede estar vacío.';

  if (!isValidCategoryForType(input.category, 'gasto')) {
    return 'La categoría no es válida para un gasto.';
  }

  switch (input.amountMode) {
    case 'fixed':
    case 'estimated':
      if (input.amount == null || !Number.isFinite(input.amount) || input.amount <= 0) {
        return 'El monto debe ser un número mayor a 0.';
      }
      break;
    case 'unknown':
      if (input.amount != null) return 'Un gasto de importe desconocido no debe tener monto.';
      break;
    default:
      return 'Modalidad de monto inválida.';
  }

  if (input.fundAssignmentMode === 'fixed') {
    if (input.fundId == null) return 'Elegí el fondo desde el que se paga.';
  } else if (input.fundAssignmentMode === 'ask_on_payment') {
    if (input.fundId != null) return 'Con "preguntar al registrar" no se fija un fondo.';
  } else {
    return 'Modalidad de fondo inválida.';
  }

  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31) {
    return 'El día del mes debe estar entre 1 y 31.';
  }

  if (!DATE_RE.test(input.startDate)) return 'La fecha de inicio es obligatoria (AAAA-MM-DD).';
  if (input.endDate != null) {
    if (!DATE_RE.test(input.endDate)) return 'La fecha final debe tener formato AAAA-MM-DD.';
    if (compareDateStrings(input.endDate, input.startDate) < 0) {
      return 'La fecha final no puede ser anterior a la de inicio.';
    }
  }

  return null;
}
