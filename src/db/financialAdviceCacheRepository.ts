import type { AIProvider } from '../types';
import type { AnalysisPeriodPreset } from '../types/financialAnalytics';
import type { FinancialAdvice } from '../types/financialAdvice';
import type { SqlDatabase } from './sqlDatabase';

export interface CachedAdvice {
  periodPreset: AnalysisPeriodPreset;
  periodStart: string;
  periodEnd: string;
  provider: AIProvider;
  snapshotHash: string;
  snapshotJson: string;
  advice: FinancialAdvice;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: number;
  period_preset: string;
  period_start: string;
  period_end: string;
  provider: string;
  snapshot_hash: string;
  snapshot_json: string;
  advice_json: string;
  created_at: string;
  updated_at: string;
}

function rowToCached(row: Row): CachedAdvice {
  return {
    periodPreset: row.period_preset as AnalysisPeriodPreset,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    provider: row.provider as AIProvider,
    snapshotHash: row.snapshot_hash,
    snapshotJson: row.snapshot_json,
    advice: JSON.parse(row.advice_json) as FinancialAdvice,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Devuelve el único análisis guardado (no hay historial), o null si nunca se generó uno. */
export async function getCachedAdvice(db: SqlDatabase): Promise<CachedAdvice | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM financial_advice_cache WHERE id = 1');
  return row ? rowToCached(row) : null;
}

export interface SaveCachedAdviceInput {
  periodPreset: AnalysisPeriodPreset;
  periodStart: string;
  periodEnd: string;
  provider: AIProvider;
  snapshotHash: string;
  snapshotJson: string;
  advice: FinancialAdvice;
}

/** Reemplaza el único análisis almacenado (no se conserva historial). */
export async function saveCachedAdvice(db: SqlDatabase, data: SaveCachedAdviceInput): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO financial_advice_cache
       (id, period_preset, period_start, period_end, comparison_enabled, provider, snapshot_hash, snapshot_json, advice_json, created_at, updated_at)
     VALUES (1, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       period_preset = excluded.period_preset,
       period_start = excluded.period_start,
       period_end = excluded.period_end,
       provider = excluded.provider,
       snapshot_hash = excluded.snapshot_hash,
       snapshot_json = excluded.snapshot_json,
       advice_json = excluded.advice_json,
       updated_at = excluded.updated_at`,
    [
      data.periodPreset,
      data.periodStart,
      data.periodEnd,
      data.provider,
      data.snapshotHash,
      data.snapshotJson,
      JSON.stringify(data.advice),
      now,
      now,
    ]
  );
}

export async function clearCachedAdvice(db: SqlDatabase): Promise<void> {
  await db.runAsync('DELETE FROM financial_advice_cache WHERE id = 1', []);
}

/**
 * Marca una recomendación como descartada dentro del único análisis
 * almacenado (no crea un registro nuevo ni toca movimientos/presupuestos).
 * Al regenerar, el análisis se reemplaza por completo y los descartes se
 * pierden naturalmente (comportamiento esperado).
 */
export async function dismissRecommendation(
  db: SqlDatabase,
  recommendationId: string
): Promise<CachedAdvice | null> {
  const cached = await getCachedAdvice(db);
  if (!cached) return null;
  const updatedAdvice: FinancialAdvice = {
    ...cached.advice,
    recommendations: cached.advice.recommendations.map((r) =>
      r.id === recommendationId ? { ...r, dismissed: true } : r
    ),
  };
  await saveCachedAdvice(db, {
    periodPreset: cached.periodPreset,
    periodStart: cached.periodStart,
    periodEnd: cached.periodEnd,
    provider: cached.provider,
    snapshotHash: cached.snapshotHash,
    snapshotJson: cached.snapshotJson,
    advice: updatedAdvice,
  });
  return { ...cached, advice: updatedAdvice };
}
