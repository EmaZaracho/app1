import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { restoreMovement } from '../db/database';
import { relinkOccurrence } from '../recurring/recurringPayment';
import type { SqlDatabase } from '../db/sqlDatabase';
import type { Movement } from '../types';

const UNDO_TIMEOUT_MS = 5000;

export interface UseMovementUndoResult {
  undoMovement: Movement | null;
  showUndoBanner: (movement: Movement, occurrenceId?: number | null) => void;
  handleUndo: () => Promise<void>;
}

/** Banner de "deshacer" tras borrar un movimiento: restaura y, si estaba vinculado a una ocurrencia recurrente, la re-vincula. */
export function useMovementUndo(db: SqlDatabase, onRestored: () => Promise<void> | void): UseMovementUndoResult {
  const [undoMovement, setUndoMovement] = useState<Movement | null>(null);
  const occurrenceIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const showUndoBanner = useCallback((movement: Movement, occurrenceId: number | null = null) => {
    occurrenceIdRef.current = occurrenceId;
    setUndoMovement(movement);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setUndoMovement(null), UNDO_TIMEOUT_MS);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoMovement) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const toRestore = undoMovement;
    const occId = occurrenceIdRef.current;
    occurrenceIdRef.current = null;
    setUndoMovement(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await restoreMovement(db, toRestore);
    if (occId != null) await relinkOccurrence(db, occId, toRestore.id);
    await onRestored();
  }, [db, undoMovement, onRestored]);

  return { undoMovement, showUndoBanner, handleUndo };
}
