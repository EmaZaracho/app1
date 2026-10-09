import { validateMovement } from '../domain/movementRules';
import { isValidCategoryForType, type Category, type ExpenseCategory, type Movement, type MovementType, type NewMovement } from '../types';
import type { DateRange } from './dateRange';
import type { SqlDatabase } from './sqlDatabase';

interface MovementRow {
  id: number;
  type: string;
  amount: number;
  category: string | null;
  description: string;
  raw_text: string;
  source_fund_id: number | null;
  destination_fund_id: number | null;
  created_at: string;
  purchase_id: number | null;
}

const MOVEMENT_TYPES: MovementType[] = ['gasto', 'ingreso', 'transferencia', 'ajuste'];

function rowToMovement(row: MovementRow): Movement {
  const type = (MOVEMENT_TYPES as string[]).includes(row.type)
    ? (row.type as MovementType)
    : 'gasto';
  return {
    id: row.id,
    type,
    amount: row.amount,
    category: (row.category as Category | null) ?? null,
    description: row.description,
    rawText: row.raw_text,
    sourceFundId: row.source_fund_id,
    destinationFundId: row.destination_fund_id,
    createdAt: row.created_at,
    purchaseId: row.purchase_id ?? null,
  };
}

/**
 * Inserta un movimiento validando sus invariantes. Es la única puerta de
 * entrada para crear movimientos (gastos, ingresos, transferencias, ajustes).
 */
export async function insertMovement(
  db: SqlDatabase,
  movement: NewMovement,
  createdAt: string = new Date().toISOString(),
  purchaseId: number | null = null
): Promise<Movement> {
  const error = validateMovement(movement);
  if (error) throw new Error(error);

  const result = await db.runAsync(
    `INSERT INTO movements
       (type, amount, category, description, raw_text, source_fund_id, destination_fund_id, created_at, purchase_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movement.type,
      movement.amount,
      movement.category,
      movement.description,
      movement.rawText,
      movement.sourceFundId,
      movement.destinationFundId,
      createdAt,
      purchaseId,
    ]
  );
  return { id: result.lastInsertRowId, createdAt, purchaseId, ...movement };
}

/** Alias público para agregar un movimiento desde la UI. */
export function addMovement(db: SqlDatabase, movement: NewMovement): Promise<Movement> {
  return insertMovement(db, movement);
}

/**
 * Inserta varios movimientos en una sola transacción (todo o nada). Se usa
 * para el escaneo de facturas: si un ítem falla, ninguno queda insertado.
 */
export async function addMovements(db: SqlDatabase, movements: NewMovement[]): Promise<Movement[]> {
  const created: Movement[] = [];
  await db.withTransactionAsync(async () => {
    for (const movement of movements) {
      created.push(await insertMovement(db, movement));
    }
  });
  return created;
}

/**
 * Guarda varios gastos como una sola compra de varios: crea la compra y cada
 * ítem queda como movimiento propio (con la misma fecha), todo o nada. Los
 * totales por categoría, presupuestos y saldos no cambian porque los ítems
 * siguen siendo gastos individuales.
 */
export async function addPurchase(
  db: SqlDatabase,
  movements: NewMovement[],
  merchant: string | null
): Promise<Movement[]> {
  const created: Movement[] = [];
  await db.withTransactionAsync(async () => {
    const purchase = await db.runAsync('INSERT INTO purchases (merchant) VALUES (?)', [merchant?.trim() || null]);
    const createdAt = new Date().toISOString();
    for (const movement of movements) {
      created.push(await insertMovement(db, movement, createdAt, purchase.lastInsertRowId));
    }
  });
  return created;
}

/** Comercio de cada compra de varios (null si no se cargó). */
export async function getPurchaseMerchants(db: SqlDatabase): Promise<Map<number, string | null>> {
  const rows = await db.getAllAsync<{ id: number; merchant: string | null }>('SELECT id, merchant FROM purchases');
  return new Map(rows.map((row) => [row.id, row.merchant]));
}

export interface Purchase {
  id: number;
  merchant: string | null;
}

export async function getPurchase(db: SqlDatabase, id: number): Promise<Purchase | null> {
  const row = await db.getFirstAsync<Purchase>('SELECT id, merchant FROM purchases WHERE id = ?', [id]);
  return row ?? null;
}

/** Ítems de una compra de varios, en el orden en que se cargaron. */
export async function getPurchaseMovements(db: SqlDatabase, purchaseId: number): Promise<Movement[]> {
  const rows = await db.getAllAsync<MovementRow>(
    'SELECT * FROM movements WHERE purchase_id = ? ORDER BY id ASC',
    [purchaseId]
  );
  return rows.map(rowToMovement);
}

export async function updatePurchaseMerchant(
  db: SqlDatabase,
  purchaseId: number,
  merchant: string
): Promise<void> {
  await db.runAsync('UPDATE purchases SET merchant = ? WHERE id = ?', [merchant.trim() || null, purchaseId]);
}

/** Saca un ítem de la compra: pasa a ser un gasto suelto (no se borra ni cambia su monto). */
export async function detachMovementFromPurchase(db: SqlDatabase, movementId: number): Promise<void> {
  await db.runAsync('UPDATE movements SET purchase_id = NULL WHERE id = ?', [movementId]);
}

/**
 * Agrega un gasto a una compra existente, con el mismo fondo y fecha que sus
 * demás ítems. Falla si la compra ya no tiene ítems de los cuales copiarlos.
 */
export async function addMovementToPurchase(
  db: SqlDatabase,
  purchaseId: number,
  item: { amount: number; category: ExpenseCategory; description: string }
): Promise<Movement> {
  const reference = (await getPurchaseMovements(db, purchaseId)).find((m) => m.type === 'gasto');
  if (!reference || reference.sourceFundId == null) {
    throw new Error('La compra ya no tiene ítems: cargá el gasto como un movimiento nuevo.');
  }
  return insertMovement(
    db,
    {
      type: 'gasto',
      amount: item.amount,
      category: item.category,
      description: item.description,
      rawText: reference.rawText,
      sourceFundId: reference.sourceFundId,
      destinationFundId: null,
    },
    reference.createdAt,
    purchaseId
  );
}

export async function getMovements(db: SqlDatabase): Promise<Movement[]> {
  const rows = await db.getAllAsync<MovementRow>('SELECT * FROM movements ORDER BY id DESC');
  return rows.map(rowToMovement);
}

/**
 * Gastos que componen el total de una categoría en el resumen: mismo filtro
 * (solo type = 'gasto', rango [start, end) y línea base) que los totales por
 * categoría, del más reciente al más antiguo. Las categorías desconocidas
 * cuentan como "Otros", igual que en los totales.
 */
export async function getExpensesForCategory(
  db: SqlDatabase,
  category: ExpenseCategory,
  range: DateRange | null,
  trackingStart: string | null = null
): Promise<Movement[]> {
  const rows = await db.getAllAsync<MovementRow>(
    `SELECT * FROM movements
     WHERE type = 'gasto'
       AND (? IS NULL OR created_at >= ?)
       AND (? IS NULL OR created_at < ?)
       AND (? IS NULL OR created_at >= ?)
     ORDER BY created_at DESC, id DESC`,
    [range?.start ?? null, range?.start ?? null, range?.end ?? null, range?.end ?? null, trackingStart, trackingStart]
  );
  return rows
    .filter((row) => {
      const effective = row.category && isValidCategoryForType(row.category, 'gasto') ? row.category : 'Otros';
      return effective === category;
    })
    .map(rowToMovement);
}

/** Movimientos donde el fondo participa como origen o destino. */
export async function getMovementsForFund(db: SqlDatabase, fundId: number): Promise<Movement[]> {
  const rows = await db.getAllAsync<MovementRow>(
    'SELECT * FROM movements WHERE source_fund_id = ? OR destination_fund_id = ? ORDER BY id DESC',
    [fundId, fundId]
  );
  return rows.map(rowToMovement);
}

export async function getMovementById(db: SqlDatabase, id: number): Promise<Movement | null> {
  const row = await db.getFirstAsync<MovementRow>('SELECT * FROM movements WHERE id = ?', [id]);
  return row ? rowToMovement(row) : null;
}

/** Actualiza todos los campos de un movimiento, revalidando sus invariantes. */
export async function updateMovement(
  db: SqlDatabase,
  id: number,
  movement: NewMovement
): Promise<void> {
  const error = validateMovement(movement);
  if (error) throw new Error(error);
  await db.runAsync(
    `UPDATE movements
       SET type = ?, amount = ?, category = ?, description = ?,
           source_fund_id = ?, destination_fund_id = ?
     WHERE id = ?`,
    [
      movement.type,
      movement.amount,
      movement.category,
      movement.description,
      movement.sourceFundId,
      movement.destinationFundId,
      id,
    ]
  );
}

export async function deleteMovement(db: SqlDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM movements WHERE id = ?', [id]);
}

/** Restaura un movimiento eliminado preservando id, fondos, categoría y fecha. */
export async function restoreMovement(db: SqlDatabase, movement: Movement): Promise<void> {
  await db.runAsync(
    `INSERT INTO movements
       (id, type, amount, category, description, raw_text, source_fund_id, destination_fund_id, created_at, purchase_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movement.id,
      movement.type,
      movement.amount,
      movement.category,
      movement.description,
      movement.rawText,
      movement.sourceFundId,
      movement.destinationFundId,
      movement.createdAt,
      movement.purchaseId,
    ]
  );
}

/** Cantidad de movimientos que referencian a un fondo (para decidir archivar vs eliminar). */
export async function countMovementsForFund(db: SqlDatabase, fundId: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) as n FROM movements WHERE source_fund_id = ? OR destination_fund_id = ?',
    [fundId, fundId]
  );
  return row?.n ?? 0;
}
