import { currentMonthRange } from './dateRange';
import type { SqlDatabase } from './sqlDatabase';

/**
 * Fuente ÚNICA de cálculo de saldos. Ningún componente ni otro repositorio
 * debe recomputar estas fórmulas: todos los saldos derivan de `movements`.
 */

export interface FundBalanceRow {
  id: number;
  balance: number;
}

export interface SlideStats {
  balance: number;
  /** Ingresos reales (excluye transferencias y ajustes). */
  income: number;
  /** Gastos reales (excluye transferencias y ajustes). */
  expense: number;
  /** Variación de saldo del mes en curso. */
  monthlyVariation: number;
}

/** Saldo de cada fondo: recibido (destino) menos enviado (origen). */
export async function getFundBalances(db: SqlDatabase): Promise<FundBalanceRow[]> {
  return db.getAllAsync<FundBalanceRow>(
    `SELECT f.id AS id,
       COALESCE(inc.total, 0) - COALESCE(exp.total, 0) AS balance
     FROM funds f
     LEFT JOIN (
       SELECT destination_fund_id AS fid, SUM(amount) AS total
       FROM movements WHERE destination_fund_id IS NOT NULL GROUP BY destination_fund_id
     ) inc ON inc.fid = f.id
     LEFT JOIN (
       SELECT source_fund_id AS fid, SUM(amount) AS total
       FROM movements WHERE source_fund_id IS NOT NULL GROUP BY source_fund_id
     ) exp ON exp.fid = f.id`
  );
}

/** Saldo de un fondo puntual. */
export async function getFundBalance(db: SqlDatabase, fundId: number): Promise<number> {
  const row = await db.getFirstAsync<{ balance: number }>(
    `SELECT
       COALESCE((SELECT SUM(amount) FROM movements WHERE destination_fund_id = ?), 0)
       - COALESCE((SELECT SUM(amount) FROM movements WHERE source_fund_id = ?), 0) AS balance`,
    [fundId, fundId]
  );
  return row?.balance ?? 0;
}

/** Saldo total: suma de los saldos de los fondos activos. Las transferencias se cancelan. */
export async function getTotalBalance(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(bal.balance), 0) AS total FROM (
       SELECT
         COALESCE((SELECT SUM(amount) FROM movements WHERE destination_fund_id = f.id), 0)
         - COALESCE((SELECT SUM(amount) FROM movements WHERE source_fund_id = f.id), 0) AS balance
       FROM funds f WHERE f.is_archived = 0
     ) bal`
  );
  return row?.total ?? 0;
}

/** Ingresos y gastos globales reales (excluye transferencias y ajustes). */
export async function getGlobalIncomeExpense(
  db: SqlDatabase
): Promise<{ income: number; expense: number }> {
  const row = await db.getFirstAsync<{ income: number; expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END), 0) AS expense
     FROM movements`
  );
  return { income: row?.income ?? 0, expense: row?.expense ?? 0 };
}

/** Ingresos y gastos reales de un fondo (excluye transferencias y ajustes). */
export async function getFundIncomeExpense(
  db: SqlDatabase,
  fundId: number
): Promise<{ income: number; expense: number }> {
  const row = await db.getFirstAsync<{ income: number; expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'ingreso' AND destination_fund_id = ? THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'gasto' AND source_fund_id = ? THEN amount ELSE 0 END), 0) AS expense
     FROM movements`,
    [fundId, fundId]
  );
  return { income: row?.income ?? 0, expense: row?.expense ?? 0 };
}

/** Variación mensual del Total: ingresos, gastos y ajustes; transferencias se cancelan. */
export async function getTotalMonthlyVariation(db: SqlDatabase): Promise<number> {
  const { start, end } = currentMonthRange();
  const row = await db.getFirstAsync<{ variation: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END), 0)
       + COALESCE(SUM(CASE WHEN type = 'ajuste' AND destination_fund_id IS NOT NULL THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'ajuste' AND source_fund_id IS NOT NULL THEN amount ELSE 0 END), 0)
       AS variation
     FROM movements WHERE created_at >= ? AND created_at < ?`,
    [start, end]
  );
  return row?.variation ?? 0;
}

/** Variación mensual de un fondo: todos los cambios de saldo del mes (incluye transferencias y ajustes). */
export async function getFundMonthlyVariation(db: SqlDatabase, fundId: number): Promise<number> {
  const { start, end } = currentMonthRange();
  const row = await db.getFirstAsync<{ variation: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN destination_fund_id = ? THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN source_fund_id = ? THEN amount ELSE 0 END), 0)
       AS variation
     FROM movements WHERE created_at >= ? AND created_at < ?`,
    [fundId, fundId, start, end]
  );
  return row?.variation ?? 0;
}

/** Estadísticas de la vista Total (sintética). */
export async function getTotalStats(db: SqlDatabase): Promise<SlideStats> {
  const [balance, incExp, monthlyVariation] = await Promise.all([
    getTotalBalance(db),
    getGlobalIncomeExpense(db),
    getTotalMonthlyVariation(db),
  ]);
  return { balance, income: incExp.income, expense: incExp.expense, monthlyVariation };
}

/** Estadísticas de un fondo puntual. */
export async function getFundStats(db: SqlDatabase, fundId: number): Promise<SlideStats> {
  const [balance, incExp, monthlyVariation] = await Promise.all([
    getFundBalance(db, fundId),
    getFundIncomeExpense(db, fundId),
    getFundMonthlyVariation(db, fundId),
  ]);
  return { balance, income: incExp.income, expense: incExp.expense, monthlyVariation };
}
