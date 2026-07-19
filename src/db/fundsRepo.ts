import { findNameConflicts, type FundMatchTarget } from '../domain/fundMatching';
import { buildAdjustmentMovement } from '../domain/movementRules';
import { normalizeName } from '../domain/normalize';
import { DEFAULT_FUND_COLOR, DEFAULT_FUND_ICON } from '../fundVisuals';
import type { Fund, FundAlias, FundWithBalance } from '../types';
import { getFundBalance, getFundBalances } from './balances';
import { countMovementsForFund, insertMovement } from './movementsRepo';
import type { SqlDatabase } from './sqlDatabase';

interface FundRow {
  id: number;
  name: string;
  normalized_name: string;
  icon: string;
  color: string;
  is_default: number;
  is_archived: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface AliasRow {
  id: number;
  fund_id: number;
  alias: string;
  normalized_alias: string;
}

function rowToFund(row: FundRow): Fund {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    icon: row.icon,
    color: row.color,
    isDefault: row.is_default === 1,
    isArchived: row.is_archived === 1,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAlias(row: AliasRow): FundAlias {
  return {
    id: row.id,
    fundId: row.fund_id,
    alias: row.alias,
    normalizedAlias: row.normalized_alias,
  };
}

export async function getFunds(
  db: SqlDatabase,
  includeArchived = false
): Promise<Fund[]> {
  const where = includeArchived ? '' : 'WHERE is_archived = 0';
  const rows = await db.getAllAsync<FundRow>(
    `SELECT * FROM funds ${where} ORDER BY is_default DESC, display_order, id`
  );
  return rows.map(rowToFund);
}

export async function getFundById(db: SqlDatabase, id: number): Promise<Fund | null> {
  const row = await db.getFirstAsync<FundRow>('SELECT * FROM funds WHERE id = ?', [id]);
  return row ? rowToFund(row) : null;
}

export async function getAliasesForFund(db: SqlDatabase, fundId: number): Promise<FundAlias[]> {
  const rows = await db.getAllAsync<AliasRow>(
    'SELECT * FROM fund_aliases WHERE fund_id = ? ORDER BY id',
    [fundId]
  );
  return rows.map(rowToAlias);
}

async function getAllAliases(db: SqlDatabase): Promise<Map<number, FundAlias[]>> {
  const rows = await db.getAllAsync<AliasRow>('SELECT * FROM fund_aliases ORDER BY id');
  const map = new Map<number, FundAlias[]>();
  for (const row of rows) {
    const alias = rowToAlias(row);
    const list = map.get(alias.fundId) ?? [];
    list.push(alias);
    map.set(alias.fundId, list);
  }
  return map;
}

/** Fondos con sus alias y saldo calculado, para la UI. */
export async function getFundsWithBalances(
  db: SqlDatabase,
  includeArchived = false
): Promise<FundWithBalance[]> {
  const [funds, aliasMap, balances] = await Promise.all([
    getFunds(db, includeArchived),
    getAllAliases(db),
    getFundBalances(db),
  ]);
  const balanceMap = new Map(balances.map((b) => [b.id, b.balance]));
  return funds.map((fund) => ({
    ...fund,
    aliases: aliasMap.get(fund.id) ?? [],
    balance: balanceMap.get(fund.id) ?? 0,
  }));
}

/** Objetivos de matching (nombre + alias) para resolver referencias de la IA. */
export async function getFundMatchTargets(
  db: SqlDatabase,
  activeOnly = true
): Promise<FundMatchTarget[]> {
  const funds = await getFunds(db, !activeOnly);
  const aliasMap = await getAllAliases(db);
  return funds.map((fund) => ({
    id: fund.id,
    name: fund.name,
    normalizedName: fund.normalizedName,
    aliases: (aliasMap.get(fund.id) ?? []).map((a) => ({ normalizedAlias: a.normalizedAlias })),
  }));
}

export async function countActiveFunds(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) as n FROM funds WHERE is_archived = 0'
  );
  return row?.n ?? 0;
}

/**
 * Verifica que el nombre canónico y los alias de un fondo no colisionen con
 * otros fondos activos. Lanza un error con el detalle si hay conflicto.
 */
export async function assertNoNameConflicts(
  db: SqlDatabase,
  name: string,
  aliases: string[],
  excludeFundId?: number
): Promise<void> {
  const targets = await getFundMatchTargets(db, true);
  const conflicts = findNameConflicts([name, ...aliases], targets, excludeFundId);
  if (conflicts.length > 0) {
    throw new Error(`Ya existe un fondo o alias con: ${conflicts.join(', ')}.`);
  }
}

export interface CreateFundInput {
  name: string;
  icon?: string;
  color?: string;
  aliases?: string[];
  isDefault?: boolean;
  initialBalance?: number;
}

/**
 * Crea un fondo con alias opcionales y, si el saldo inicial es distinto de 0,
 * registra un movimiento de ajuste "Saldo inicial". Todo en una transacción.
 */
export async function createFund(db: SqlDatabase, input: CreateFundInput): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new Error('El nombre del fondo no puede estar vacío.');
  const aliases = (input.aliases ?? []).map((a) => a.trim()).filter(Boolean);
  await assertNoNameConflicts(db, name, aliases);

  let fundId = 0;
  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    const orderRow = await db.getFirstAsync<{ next: number }>(
      'SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM funds'
    );
    const displayOrder = orderRow?.next ?? 1;

    if (input.isDefault) {
      await db.runAsync('UPDATE funds SET is_default = 0', []);
    }

    const result = await db.runAsync(
      `INSERT INTO funds
         (name, normalized_name, icon, color, is_default, is_archived, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        name,
        normalizeName(name),
        input.icon ?? DEFAULT_FUND_ICON,
        input.color ?? DEFAULT_FUND_COLOR,
        input.isDefault ? 1 : 0,
        displayOrder,
        now,
        now,
      ]
    );
    fundId = result.lastInsertRowId;

    for (const alias of aliases) {
      await db.runAsync(
        'INSERT INTO fund_aliases (fund_id, alias, normalized_alias) VALUES (?, ?, ?)',
        [fundId, alias, normalizeName(alias)]
      );
    }

    const adjustment = buildAdjustmentMovement(
      fundId,
      input.initialBalance ?? 0,
      'Saldo inicial',
      `[saldo-inicial] ${name}`
    );
    if (adjustment) {
      await insertMovement(db, adjustment, now);
    }
  });

  return fundId;
}

export interface UpdateFundInput {
  name: string;
  icon: string;
  color: string;
}

/** Actualiza nombre, icono y color de un fondo (revalida conflicto de nombre). */
export async function updateFund(
  db: SqlDatabase,
  id: number,
  input: UpdateFundInput
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error('El nombre del fondo no puede estar vacío.');
  const existingAliases = await getAliasesForFund(db, id);
  await assertNoNameConflicts(db, name, existingAliases.map((a) => a.alias), id);
  await db.runAsync(
    'UPDATE funds SET name = ?, normalized_name = ?, icon = ?, color = ?, updated_at = ? WHERE id = ?',
    [name, normalizeName(name), input.icon, input.color, new Date().toISOString(), id]
  );
}

/** Reemplaza el conjunto de alias de un fondo (revalida conflictos). */
export async function setFundAliases(
  db: SqlDatabase,
  fundId: number,
  aliases: string[]
): Promise<void> {
  const fund = await getFundById(db, fundId);
  if (!fund) throw new Error('El fondo no existe.');
  const cleaned = aliases.map((a) => a.trim()).filter(Boolean);
  await assertNoNameConflicts(db, fund.name, cleaned, fundId);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM fund_aliases WHERE fund_id = ?', [fundId]);
    for (const alias of cleaned) {
      await db.runAsync(
        'INSERT INTO fund_aliases (fund_id, alias, normalized_alias) VALUES (?, ?, ?)',
        [fundId, alias, normalizeName(alias)]
      );
    }
    await db.runAsync('UPDATE funds SET updated_at = ? WHERE id = ?', [
      new Date().toISOString(),
      fundId,
    ]);
  });
}

/** Marca un fondo como predeterminado (desmarca los demás). Debe estar activo. */
export async function setDefaultFund(db: SqlDatabase, id: number): Promise<void> {
  const fund = await getFundById(db, id);
  if (!fund) throw new Error('El fondo no existe.');
  if (fund.isArchived) throw new Error('No se puede marcar como predeterminado un fondo archivado.');
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE funds SET is_default = 0', []);
    await db.runAsync('UPDATE funds SET is_default = 1 WHERE id = ?', [id]);
  });
}

/** Si el fondo era predeterminado, elige otro fondo activo como predeterminado. */
async function reassignDefaultIfNeeded(db: SqlDatabase, removedFundId: number): Promise<void> {
  const stillDefault = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM funds WHERE is_default = 1 AND is_archived = 0 LIMIT 1'
  );
  if (stillDefault) return;
  const next = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM funds WHERE is_archived = 0 AND id <> ? ORDER BY display_order, id LIMIT 1',
    [removedFundId]
  );
  if (next) {
    await db.runAsync('UPDATE funds SET is_default = 0', []);
    await db.runAsync('UPDATE funds SET is_default = 1 WHERE id = ?', [next.id]);
  }
}

/**
 * Archiva un fondo. Solo si su saldo es 0 y no es el último fondo activo.
 */
export async function archiveFund(db: SqlDatabase, id: number): Promise<void> {
  const activeCount = await countActiveFunds(db);
  if (activeCount <= 1) {
    throw new Error('No podés archivar el último fondo activo.');
  }
  const balance = await getFundBalance(db, id);
  if (Math.abs(balance) > 0.005) {
    throw new Error(
      'El fondo tiene saldo distinto de cero. Transferí o ajustá su saldo a $0 antes de archivarlo.'
    );
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE funds SET is_archived = 1, is_default = 0, updated_at = ? WHERE id = ?', [
      new Date().toISOString(),
      id,
    ]);
    await reassignDefaultIfNeeded(db, id);
  });
}

export async function unarchiveFund(db: SqlDatabase, id: number): Promise<void> {
  await db.runAsync('UPDATE funds SET is_archived = 0, updated_at = ? WHERE id = ?', [
    new Date().toISOString(),
    id,
  ]);
}

/**
 * Elimina físicamente un fondo. Solo si no tiene movimientos y no es el último
 * fondo activo. Si tiene movimientos, se debe archivar en su lugar.
 */
export async function deleteFund(db: SqlDatabase, id: number): Promise<void> {
  const movements = await countMovementsForFund(db, id);
  if (movements > 0) {
    throw new Error('El fondo tiene movimientos. Archivalo en lugar de eliminarlo.');
  }
  const fund = await getFundById(db, id);
  if (!fund) return;
  if (!fund.isArchived) {
    const activeCount = await countActiveFunds(db);
    if (activeCount <= 1) {
      throw new Error('No podés eliminar el último fondo activo.');
    }
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM funds WHERE id = ?', [id]);
    await reassignDefaultIfNeeded(db, id);
  });
}

/**
 * Ajusta el saldo del fondo al nuevo saldo real deseado, creando un movimiento
 * de ajuste por la diferencia. No sobrescribe ningún saldo almacenado. Si la
 * diferencia es 0, no hace nada.
 */
export async function adjustFundBalance(
  db: SqlDatabase,
  fundId: number,
  newBalance: number
): Promise<void> {
  if (!Number.isFinite(newBalance)) throw new Error('El saldo debe ser un número válido.');
  const current = await getFundBalance(db, fundId);
  const difference = newBalance - current;
  const adjustment = buildAdjustmentMovement(
    fundId,
    difference,
    'Ajuste manual de saldo',
    `[ajuste-manual] nuevo saldo ${newBalance}`
  );
  if (adjustment) {
    await insertMovement(db, adjustment);
  }
}
