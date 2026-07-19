import { isCategorizedType, type MovementType, type NewMovement } from '../types';

/**
 * Valida las invariantes de origen/destino/categoría de un movimiento.
 * Devuelve un mensaje de error o null si es válido. Refleja las mismas reglas
 * que los CHECK de la tabla movements, para poder validar antes de tocar la DB.
 */
export function validateMovement(m: NewMovement): string | null {
  if (!Number.isFinite(m.amount) || m.amount <= 0) {
    return 'El monto debe ser un número mayor a 0.';
  }
  switch (m.type) {
    case 'gasto':
      if (m.sourceFundId == null) return 'Un gasto requiere un fondo de origen.';
      if (m.destinationFundId != null) return 'Un gasto no debe tener fondo de destino.';
      if (m.category == null) return 'Un gasto requiere categoría.';
      return null;
    case 'ingreso':
      if (m.destinationFundId == null) return 'Un ingreso requiere un fondo de destino.';
      if (m.sourceFundId != null) return 'Un ingreso no debe tener fondo de origen.';
      if (m.category == null) return 'Un ingreso requiere categoría.';
      return null;
    case 'transferencia':
      if (m.sourceFundId == null || m.destinationFundId == null) {
        return 'Una transferencia requiere fondo de origen y de destino.';
      }
      if (m.sourceFundId === m.destinationFundId) {
        return 'El origen y el destino de una transferencia deben ser distintos.';
      }
      if (m.category != null) return 'Una transferencia no lleva categoría.';
      return null;
    case 'ajuste': {
      const hasSource = m.sourceFundId != null;
      const hasDest = m.destinationFundId != null;
      if (hasSource === hasDest) {
        return 'Un ajuste requiere exactamente un fondo (origen o destino).';
      }
      if (m.category != null) return 'Un ajuste no lleva categoría.';
      return null;
    }
    default:
      return 'Tipo de movimiento inválido.';
  }
}

export interface FundOption {
  id: number;
  isDefault: boolean;
}

export interface FundSelectionInput {
  type: MovementType;
  /** Fondo de origen ya resuelto (por la IA o el usuario), o null si falta. */
  resolvedSourceId: number | null;
  /** Fondo de destino ya resuelto, o null si falta. */
  resolvedDestId: number | null;
  activeFunds: FundOption[];
}

export interface FundSelectionResult {
  sourceFundId: number | null;
  destinationFundId: number | null;
  /** El usuario debe elegir el fondo de origen en la vista previa. */
  needsSource: boolean;
  needsDestination: boolean;
  /** true si ya se puede confirmar (todos los fondos requeridos están puestos). */
  canConfirm: boolean;
  /** Mensaje que bloquea la operación (p. ej. transferencia con <2 fondos). */
  blockingMessage?: string;
}

/**
 * Calcula qué fondos quedan asignados y cuáles debe pedir la vista previa.
 *
 * Reglas:
 * - Con exactamente un fondo activo, gastos e ingresos lo asignan solos.
 * - Con varios fondos, nunca se asigna el predeterminado automáticamente.
 * - Las transferencias requieren dos fondos activos distintos; nunca se
 *   auto-asignan.
 */
export function computeFundSelection(input: FundSelectionInput): FundSelectionResult {
  const { type, activeFunds } = input;
  const onlyFundId = activeFunds.length === 1 ? activeFunds[0].id : null;

  if (type === 'gasto') {
    const sourceFundId = input.resolvedSourceId ?? onlyFundId;
    const needsSource = sourceFundId == null;
    return {
      sourceFundId,
      destinationFundId: null,
      needsSource,
      needsDestination: false,
      canConfirm: !needsSource,
    };
  }

  if (type === 'ingreso') {
    const destinationFundId = input.resolvedDestId ?? onlyFundId;
    const needsDestination = destinationFundId == null;
    return {
      sourceFundId: null,
      destinationFundId,
      needsSource: false,
      needsDestination,
      canConfirm: !needsDestination,
    };
  }

  if (type === 'transferencia') {
    if (activeFunds.length < 2) {
      return {
        sourceFundId: input.resolvedSourceId,
        destinationFundId: input.resolvedDestId,
        needsSource: input.resolvedSourceId == null,
        needsDestination: input.resolvedDestId == null,
        canConfirm: false,
        blockingMessage:
          'Necesitás al menos dos fondos activos para transferir. Creá otro fondo primero.',
      };
    }
    const sourceFundId = input.resolvedSourceId;
    const destinationFundId = input.resolvedDestId;
    const needsSource = sourceFundId == null;
    const needsDestination = destinationFundId == null;
    const sameFund =
      sourceFundId != null && destinationFundId != null && sourceFundId === destinationFundId;
    return {
      sourceFundId,
      destinationFundId,
      needsSource,
      needsDestination,
      canConfirm: !needsSource && !needsDestination && !sameFund,
      blockingMessage: sameFund
        ? 'El origen y el destino deben ser fondos distintos.'
        : undefined,
    };
  }

  // ajuste: se maneja desde administración de fondos, no desde la vista previa.
  return {
    sourceFundId: input.resolvedSourceId,
    destinationFundId: input.resolvedDestId,
    needsSource: false,
    needsDestination: false,
    canConfirm: validateMovement({
      type: 'ajuste',
      amount: 1,
      category: null,
      description: '',
      rawText: '',
      sourceFundId: input.resolvedSourceId,
      destinationFundId: input.resolvedDestId,
    }) == null,
  };
}

/**
 * Construye el movimiento de ajuste que representa una diferencia de saldo.
 * Diferencia positiva → ingresa al fondo (destino). Negativa → sale (origen).
 * Devuelve null si la diferencia es 0 (no se crea movimiento).
 */
export function buildAdjustmentMovement(
  fundId: number,
  difference: number,
  description: string,
  rawText: string
): NewMovement | null {
  if (!Number.isFinite(difference) || difference === 0) return null;
  const amount = Math.abs(difference);
  if (difference > 0) {
    return {
      type: 'ajuste',
      amount,
      category: null,
      description,
      rawText,
      sourceFundId: null,
      destinationFundId: fundId,
    };
  }
  return {
    type: 'ajuste',
    amount,
    category: null,
    description,
    rawText,
    sourceFundId: fundId,
    destinationFundId: null,
  };
}

/** Categoría no aplica salvo para gasto/ingreso. */
export function categoryAppliesTo(type: MovementType): boolean {
  return isCategorizedType(type);
}
