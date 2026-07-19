import { validateMovement } from '../domain/movementRules';
import type { Category, Movement, MovementType, NewMovement } from '../types';
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
  };
}

/**
 * Inserta un movimiento validando sus invariantes. Es la única puerta de
 * entrada para crear movimientos (gastos, ingresos, transferencias, ajustes).
 */
export async function insertMovement(
  db: SqlDatabase,
  movement: NewMovement,
  createdAt: string = new Date().toISOString()
): Promise<Movement> {
  const error = validateMovement(movement);
  if (error) throw new Error(error);

  const result = await db.runAsync(
    `INSERT INTO movements
       (type, amount, category, description, raw_text, source_fund_id, destination_fund_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movement.type,
      movement.amount,
      movement.category,
      movement.description,
      movement.rawText,
      movement.sourceFundId,
      movement.destinationFundId,
      createdAt,
    ]
  );
  return { id: result.lastInsertRowId, createdAt, ...movement };
}

/** Alias público para agregar un movimiento desde la UI. */
export function addMovement(db: SqlDatabase, movement: NewMovement): Promise<Movement> {
  return insertMovement(db, movement);
}

export async function getMovements(db: SqlDatabase): Promise<Movement[]> {
  const rows = await db.getAllAsync<MovementRow>('SELECT * FROM movements ORDER BY id DESC');
  return rows.map(rowToMovement);
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
       (id, type, amount, category, description, raw_text, source_fund_id, destination_fund_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
