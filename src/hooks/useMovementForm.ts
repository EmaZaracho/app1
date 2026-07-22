import { useCallback, useMemo, useState } from 'react';
import {
  buildMovementFromForm,
  computeFundSelection,
  type FundOption,
  type FundSelectionResult,
  type MovementFormResult,
} from '../domain/movementRules';
import { categoriesForType, type AIMovementType, type Category } from '../types';

export interface UseMovementFormOptions {
  /** Tipo inicial (editable salvo que se pase `lockedType`). Default 'gasto'. */
  initialType?: AIMovementType;
  /** Si está definido, el tipo queda fijo (p. ej. pago recurrente: siempre 'gasto'). */
  lockedType?: AIMovementType;
  initialAmountText?: string;
  initialCategory?: Category | null;
  initialDescription?: string;
  initialSourceFundId?: number | null;
  initialDestinationFundId?: number | null;
  activeFunds: FundOption[];
  /** Fondo predeterminado como fallback de un gasto sin fondo (SOLO flujo IA: el registro manual nunca lo pasa). */
  defaultFundId?: number | null;
}

export interface MovementFormState {
  type: AIMovementType;
  amountText: string;
  category: Category | null;
  description: string;
  sourceFundId: number | null;
  destinationFundId: number | null;
  typeLocked: boolean;
  selection: FundSelectionResult;
  amountValid: boolean;
  canSubmit: boolean;
  setType: (t: AIMovementType) => void;
  setAmountText: (v: string) => void;
  setCategory: (c: Category | null) => void;
  setDescription: (v: string) => void;
  setSourceFundId: (id: number | null) => void;
  setDestinationFundId: (id: number | null) => void;
  buildResult: (rawText: string) => MovementFormResult;
}

/**
 * Estado y validación del formulario de movimiento (gasto/ingreso/transferencia),
 * compartido por el registro manual, la vista previa de IA y el pago de una
 * ocurrencia recurrente. La resolución de fondos y la validación final viven en
 * `domain/movementRules.ts`: este hook solo orquesta estado de UI.
 */
export function useMovementForm(options: UseMovementFormOptions): MovementFormState {
  const {
    initialType = 'gasto',
    lockedType,
    initialAmountText = '',
    initialCategory = null,
    initialDescription = '',
    initialSourceFundId = null,
    initialDestinationFundId = null,
    activeFunds,
    defaultFundId = null,
  } = options;

  const startType = lockedType ?? initialType;
  const [type, setTypeState] = useState<AIMovementType>(startType);
  const [amountText, setAmountText] = useState(initialAmountText);
  const [category, setCategory] = useState<Category | null>(initialCategory);
  const [description, setDescription] = useState(initialDescription);
  const [sourceFundId, setSourceFundId] = useState<number | null>(() => {
    if (startType === 'ingreso') return null;
    return computeFundSelection({
      type: startType,
      resolvedSourceId: initialSourceFundId,
      resolvedDestId: initialDestinationFundId,
      activeFunds,
      defaultFundId,
    }).sourceFundId;
  });
  const [destinationFundId, setDestinationFundId] = useState<number | null>(() => {
    if (startType === 'gasto') return null;
    return computeFundSelection({
      type: startType,
      resolvedSourceId: initialSourceFundId,
      resolvedDestId: initialDestinationFundId,
      activeFunds,
      defaultFundId,
    }).destinationFundId;
  });

  const setType = useCallback(
    (nextType: AIMovementType) => {
      if (lockedType) return;
      setTypeState(nextType);
      setCategory((prevCategory) => {
        if (nextType === 'transferencia') return null;
        if (prevCategory && categoriesForType(nextType).includes(prevCategory)) return prevCategory;
        return categoriesForType(nextType)[0];
      });
      setSourceFundId((prevSource) => {
        const selection = computeFundSelection({
          type: nextType,
          resolvedSourceId: nextType === 'ingreso' ? null : prevSource,
          resolvedDestId: null,
          activeFunds,
          defaultFundId,
        });
        return selection.sourceFundId;
      });
      setDestinationFundId((prevDest) => {
        const selection = computeFundSelection({
          type: nextType,
          resolvedSourceId: null,
          resolvedDestId: nextType === 'gasto' ? null : prevDest,
          activeFunds,
          defaultFundId,
        });
        return selection.destinationFundId;
      });
    },
    [lockedType, activeFunds, defaultFundId]
  );

  const selection = useMemo(
    () =>
      computeFundSelection({
        type,
        resolvedSourceId: sourceFundId,
        resolvedDestId: destinationFundId,
        activeFunds,
        defaultFundId,
      }),
    [type, sourceFundId, destinationFundId, activeFunds, defaultFundId]
  );

  const amountValue = Number(amountText.replace(',', '.'));
  const amountValid = Number.isFinite(amountValue) && amountValue > 0;
  const canSubmit = selection.canConfirm && amountValid && description.trim().length > 0;

  const buildResult = useCallback(
    (rawText: string) =>
      buildMovementFromForm(
        {
          type,
          amountText,
          category,
          description,
          sourceFundId: selection.sourceFundId,
          destinationFundId: selection.destinationFundId,
        },
        rawText
      ),
    [type, amountText, category, description, selection.sourceFundId, selection.destinationFundId]
  );

  return {
    type,
    amountText,
    category,
    description,
    sourceFundId,
    destinationFundId,
    typeLocked: !!lockedType,
    selection,
    amountValid,
    canSubmit,
    setType,
    setAmountText,
    setCategory,
    setDescription,
    setSourceFundId,
    setDestinationFundId,
    buildResult,
  };
}
