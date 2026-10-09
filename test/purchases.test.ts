import { getFunds } from '../src/db/database';
import {
  addMovementToPurchase,
  addPurchase,
  detachMovementFromPurchase,
  getMovements,
  getPurchase,
  getPurchaseMerchants,
  getPurchaseMovements,
  restoreMovement,
  updatePurchaseMerchant,
} from '../src/db/movementsRepo';
import { getBudgetAlerts, setBudget } from '../src/db/budgetsRepo';
import { initDatabase } from '../src/db/schema';
import { deleteMovementsAndUnlinkOccurrences } from '../src/recurring/recurringPayment';
import { groupPurchases } from '../src/domain/purchaseGroups';
import type { Movement, NewMovement } from '../src/types';
import { freshDb } from './helpers';

function item(fundId: number, amount: number, category: 'Comida' | 'Compras', description: string): NewMovement {
  return { type: 'gasto', amount, category, description, rawText: '[factura] x', sourceFundId: fundId, destinationFundId: null };
}

function mov(id: number, purchaseId: number | null, overrides: Partial<Movement> = {}): Movement {
  return {
    id, type: 'gasto', amount: 10, category: 'Comida', description: `m${id}`, rawText: 'x',
    sourceFundId: 1, destinationFundId: null, createdAt: '2026-09-01T10:00:00.000Z', purchaseId, ...overrides,
  };
}

describe('compra de varios', () => {
  it('guarda cada ítem como gasto propio enlazado a una misma compra, con el comercio', async () => {
    const db = await freshDb();
    const fund = (await getFunds(db, false))[0].id;
    const created = await addPurchase(db, [item(fund, 100, 'Comida', 'pan'), item(fund, 50, 'Compras', 'jabón')], ' Coto ');

    const purchaseId = created[0].purchaseId;
    expect(purchaseId).not.toBeNull();
    expect(created.every((m) => m.purchaseId === purchaseId)).toBe(true);
    expect(new Set(created.map((m) => m.createdAt)).size).toBe(1);
    expect((await getPurchaseMerchants(db)).get(purchaseId as number)).toBe('Coto');

    const stored = await getMovements(db);
    expect(stored.map((m) => m.purchaseId)).toEqual([purchaseId, purchaseId]);
  });

  it('no cambia los presupuestos: los ítems siguen contando por categoría', async () => {
    const db = await freshDb();
    const fund = (await getFunds(db, false))[0].id;
    await setBudget(db, 'Comida', 60);
    await addPurchase(db, [item(fund, 100, 'Comida', 'pan'), item(fund, 50, 'Compras', 'jabón')], null);
    expect(await getBudgetAlerts(db)).toEqual([{ category: 'Comida', spent: 100, limit: 60, period: 'monthly' }]);
  });

  it('borrar y restaurar la compra conserva el vínculo', async () => {
    const db = await freshDb();
    const fund = (await getFunds(db, false))[0].id;
    const created = await addPurchase(db, [item(fund, 100, 'Comida', 'pan'), item(fund, 50, 'Compras', 'jabón')], 'Coto');

    await deleteMovementsAndUnlinkOccurrences(db, created.map((m) => m.id));
    expect(await getMovements(db)).toHaveLength(0);

    for (const m of created) await restoreMovement(db, m);
    const restored = await getMovements(db);
    expect(restored).toHaveLength(2);
    expect(restored.every((m) => m.purchaseId === created[0].purchaseId)).toBe(true);
  });

  it('agrega la columna a una base existente sin perder movimientos', async () => {
    const db = await freshDb();
    const fund = (await getFunds(db, false))[0].id;
    await addPurchase(db, [item(fund, 10, 'Comida', 'a'), item(fund, 20, 'Comida', 'b')], null);
    await db.execAsync('PRAGMA user_version = 8;');
    await initDatabase(db);
    expect(await getMovements(db)).toHaveLength(2);
  });
});

describe('groupPurchases', () => {
  it('reúne los ítems de una compra en una entrada con el total, en el lugar del primero', () => {
    const entries = groupPurchases([mov(5, null), mov(4, 1, { amount: 30 }), mov(3, 1, { amount: 20 }), mov(2, null)]);
    expect(entries.map((e) => e.kind)).toEqual(['movement', 'purchase', 'movement']);
    const purchase = entries[1];
    expect(purchase.kind === 'purchase' && purchase.total).toBe(50);
    expect(purchase.kind === 'purchase' && purchase.items.map((m) => m.id)).toEqual([4, 3]);
  });

  it('una compra con un solo ítem visible o con ítems que ya no son gasto se muestra suelta', () => {
    expect(groupPurchases([mov(2, 1)]).map((e) => e.kind)).toEqual(['movement']);
    const entries = groupPurchases([mov(3, 1), mov(2, 1, { type: 'ingreso' })]);
    expect(entries.map((e) => e.kind)).toEqual(['movement', 'movement']);
  });
});

describe('editar una compra de varios', () => {
  it('cambia el comercio, agrega ítems con el mismo fondo y fecha, y quita ítems sin borrarlos', async () => {
    const db = await freshDb();
    const fund = (await getFunds(db, false))[0].id;
    const created = await addPurchase(db, [item(fund, 100, 'Comida', 'pan'), item(fund, 50, 'Compras', 'jabón')], 'Coto');
    const purchaseId = created[0].purchaseId as number;

    await updatePurchaseMerchant(db, purchaseId, '  Día  ');
    expect((await getPurchase(db, purchaseId))?.merchant).toBe('Día');
    await updatePurchaseMerchant(db, purchaseId, '   ');
    expect((await getPurchase(db, purchaseId))?.merchant).toBeNull();

    const added = await addMovementToPurchase(db, purchaseId, { amount: 25, category: 'Comida', description: 'leche' });
    expect(added.purchaseId).toBe(purchaseId);
    expect(added.createdAt).toBe(created[0].createdAt);
    expect(added.sourceFundId).toBe(fund);
    expect((await getPurchaseMovements(db, purchaseId)).map((m) => m.description)).toEqual(['pan', 'jabón', 'leche']);

    await detachMovementFromPurchase(db, created[1].id);
    expect((await getPurchaseMovements(db, purchaseId)).map((m) => m.description)).toEqual(['pan', 'leche']);
    expect(await getMovements(db)).toHaveLength(3); // el ítem quitado sigue existiendo, suelto
  });

  it('no deja agregar a una compra sin ítems ni montos inválidos', async () => {
    const db = await freshDb();
    const fund = (await getFunds(db, false))[0].id;
    const created = await addPurchase(db, [item(fund, 10, 'Comida', 'a'), item(fund, 20, 'Comida', 'b')], null);
    const purchaseId = created[0].purchaseId as number;

    await expect(addMovementToPurchase(db, purchaseId, { amount: 0, category: 'Comida', description: 'x' })).rejects.toThrow();

    await detachMovementFromPurchase(db, created[0].id);
    await detachMovementFromPurchase(db, created[1].id);
    await expect(addMovementToPurchase(db, purchaseId, { amount: 5, category: 'Comida', description: 'x' })).rejects.toThrow(
      'La compra ya no tiene ítems'
    );
  });
});
