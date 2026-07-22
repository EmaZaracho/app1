import {
  isCategorizedType,
  isValidCategoryForType,
  type AIMovementType,
  type Category,
  type CategorizedMovementType,
  type MovementType,
  type NewMovement,
} from '../types';

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
  /** Fondo predeterminado: se usa como origen de gastos sin fondo especificado. */
  defaultFundId?: number | null;
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
 * - Un gasto sin fondo especificado usa el fondo predeterminado (si existe).
 * - Un ingreso sin fondo especificado (con varios fondos) se pregunta.
 * - Las transferencias requieren dos fondos activos distintos; nunca se
 *   auto-asignan.
 */
export function computeFundSelection(input: FundSelectionInput): FundSelectionResult {
  const { type, activeFunds } = input;
  const onlyFundId = activeFunds.length === 1 ? activeFunds[0].id : null;

  if (type === 'gasto') {
    const sourceFundId = input.resolvedSourceId ?? onlyFundId ?? input.defaultFundId ?? null;
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

/**
 * Construye el NewMovement de un gasto/ingreso/transferencia ya resuelto
 * (fondos y tipo definidos). Es la única fábrica de estos tres tipos: la usan
 * el registro manual, la vista previa de IA y el pago de una ocurrencia
 * recurrente para no duplicar esta lógica en cada pantalla.
 */
export function buildNewMovement(
  type: AIMovementType,
  amount: number,
  category: Category | null,
  description: string,
  rawText: string,
  sourceFundId: number | null,
  destinationFundId: number | null
): NewMovement {
  if (type === 'gasto') {
    return {
      type: 'gasto',
      amount,
      category: category ?? 'Otros',
      description,
      rawText,
      sourceFundId,
      destinationFundId: null,
    };
  }
  if (type === 'ingreso') {
    return {
      type: 'ingreso',
      amount,
      category: category ?? 'Otros',
      description,
      rawText,
      sourceFundId: null,
      destinationFundId,
    };
  }
  return { type: 'transferencia', amount, category: null, description, rawText, sourceFundId, destinationFundId };
}

export interface MovementFormInput {
  type: AIMovementType;
  amountText: string;
  category: Category | null;
  description: string;
  sourceFundId: number | null;
  destinationFundId: number | null;
}

export type MovementFormResult =
  | { movement: NewMovement; error?: undefined }
  | { movement?: undefined; error: string };

/**
 * Valida y construye el movimiento a partir de los campos crudos de
 * MovementFormFields (texto de monto, descripción, categoría, fondos ya
 * resueltos por `computeFundSelection`). Autoridad única de validación del
 * formulario compartido: la reutilizan el registro manual, la vista previa
 * de IA (cuando exige descripción) y el pago recurrente.
 */
export function buildMovementFromForm(input: MovementFormInput, rawText: string): MovementFormResult {
  const amount = Number(input.amountText.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Ingresá un monto válido mayor a 0.' };
  }
  if (!input.description.trim()) {
    return { error: 'Ingresá una descripción.' };
  }
  if (input.type !== 'transferencia') {
    if (input.category == null) {
      return { error: 'Elegí una categoría.' };
    }
    if (!isValidCategoryForType(input.category, input.type as CategorizedMovementType)) {
      return { error: 'La categoría no es válida para este tipo de movimiento.' };
    }
  }

  const movement = buildNewMovement(
    input.type,
    amount,
    input.type === 'transferencia' ? null : input.category,
    input.description.trim(),
    rawText,
    input.sourceFundId,
    input.destinationFundId
  );
  const domainError = validateMovement(movement);
  if (domainError) return { error: domainError };
  return { movement };
}

/**
 * Verifica que los fondos elegidos sigan activos (no archivados) al momento
 * de guardar. Cubre el caso en que un fondo se archivó en otra pantalla
 * mientras el formulario seguía abierto.
 */
export function assertFundsStillActive(
  fundIds: (number | null)[],
  activeFundIds: ReadonlySet<number>
): string | null {
  for (const id of fundIds) {
    if (id != null && !activeFundIds.has(id)) {
      return 'Uno de los fondos elegidos ya no está disponible (fue archivado). Elegí otro.';
    }
  }
  return null;
}
