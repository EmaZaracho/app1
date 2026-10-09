import type { Movement } from '../types';

export type MovementListEntry =
  | { kind: 'movement'; movement: Movement }
  | { kind: 'purchase'; purchaseId: number; items: Movement[]; total: number };

/**
 * Arma las filas de la lista: los gastos de una misma compra de varios se
 * reúnen en una sola entrada (en el lugar de su primer ítem) con el total de
 * sus ítems. Una compra con un único ítem visible, o un ítem que ya no es un
 * gasto, se muestra como movimiento suelto.
 */
export function groupPurchases(movements: Movement[]): MovementListEntry[] {
  const itemsByPurchase = new Map<number, Movement[]>();
  for (const movement of movements) {
    if (movement.type !== 'gasto' || movement.purchaseId == null) continue;
    const items = itemsByPurchase.get(movement.purchaseId) ?? [];
    items.push(movement);
    itemsByPurchase.set(movement.purchaseId, items);
  }

  const entries: MovementListEntry[] = [];
  const emitted = new Set<number>();
  for (const movement of movements) {
    const purchaseId = movement.type === 'gasto' ? movement.purchaseId : null;
    const items = purchaseId != null ? itemsByPurchase.get(purchaseId) : undefined;
    if (purchaseId == null || !items || items.length < 2) {
      entries.push({ kind: 'movement', movement });
      continue;
    }
    if (emitted.has(purchaseId)) continue;
    emitted.add(purchaseId);
    entries.push({
      kind: 'purchase',
      purchaseId,
      items,
      total: items.reduce((sum, item) => sum + item.amount, 0),
    });
  }
  return entries;
}
