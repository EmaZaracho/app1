import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { restoreMovement } from '../db/database';
import { relinkOccurrence } from '../recurring/recurringPayment';
import type { SqlDatabase } from '../db/sqlDatabase';
import type { Movement } from '../types';

const UNDO_TIMEOUT_MS = 5000;

export interface DeletedMovement {
  movement: Movement;
  occurrenceId: number | null;
}

export interface UseMovementUndoResult {
  undoMovement: Movement | null;
  showUndoBanner: (movement: Movement, occurrenceId?: number | null) => void;
  /** Igual que showUndoBanner, pero deshace todos los movimientos juntos (compra de varios). */
  showUndoBannerForMany: (deleted: DeletedMovement[]) => void;
  handleUndo: () => Promise<void>;
}

/** Banner de "deshacer" tras borrar un movimiento: restaura y, si estaba vinculado a una ocurrencia recurrente, la re-vincula. */
export function useMovementUndo(db: SqlDatabase, onRestored: () => Promise<void> | void): UseMovementUndoResult {
  const [undoItems, setUndoItems] = useState<DeletedMovement[]>([]);
  const undoMovement = undoItems[0]?.movement ?? null;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const showUndoBannerForMany = useCallback((deleted: DeletedMovement[]) => {
    setUndoItems(deleted);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setUndoItems([]), UNDO_TIMEOUT_MS);
  }, []);

  const showUndoBanner = useCallback(
    (movement: Movement, occurrenceId: number | null = null) => {
      showUndoBannerForMany([{ movement, occurrenceId }]);
    },
    [showUndoBannerForMany]
  );

  const handleUndo = useCallback(async () => {
    if (undoItems.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const toRestore = undoItems;
    setUndoItems([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await db.withTransactionAsync(async () => {
      for (const { movement, occurrenceId } of toRestore) {
        await restoreMovement(db, movement);
        if (occurrenceId != null) await relinkOccurrence(db, occurrenceId, movement.id);
      }
    });
    await onRestored();
  }, [db, undoItems, onRestored]);

  return { undoMovement, showUndoBanner, showUndoBannerForMany, handleUndo };
}
