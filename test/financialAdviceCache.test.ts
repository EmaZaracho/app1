import {
  clearCachedAdvice,
  dismissRecommendation,
  getCachedAdvice,
  saveCachedAdvice,
} from '../src/db/financialAdviceCacheRepository';
import type { FinancialAdvice } from '../src/types/financialAdvice';
import { freshDb } from './helpers';

function sampleAdvice(): FinancialAdvice {
  return {
    summary: 'Resumen de prueba',
    status: 'attention',
    strengths: [],
    recommendations: [
      {
        id: 'rec-1',
        title: 'Reducí Comida',
        reason: 'Es tu categoría más grande',
        action: 'Bajá el gasto un 10%',
        priority: 'high',
        relatedCategory: 'Comida',
        suggestedReductionPercentage: 10,
        potentialSavings: 1000,
        timeframe: 'Este mes',
        actionType: 'create_budget',
      },
    ],
    dataQualityMessage: null,
    disclaimer: 'Esto es orientativo.',
  };
}

describe('caché de análisis financiero', () => {
  it('sin análisis previo devuelve null', async () => {
    const db = await freshDb();
    expect(await getCachedAdvice(db)).toBeNull();
  });

  it('guarda y recupera el único análisis almacenado', async () => {
    const db = await freshDb();
    await saveCachedAdvice(db, {
      periodPreset: 'current_month',
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      provider: 'deepseek',
      snapshotHash: 'abc123',
      snapshotJson: '{}',
      advice: sampleAdvice(),
    });
    const cached = await getCachedAdvice(db);
    expect(cached?.snapshotHash).toBe('abc123');
    expect(cached?.advice.summary).toBe('Resumen de prueba');
  });

  it('guardar un análisis nuevo reemplaza el anterior (no se acumula historial)', async () => {
    const db = await freshDb();
    await saveCachedAdvice(db, {
      periodPreset: 'current_month',
      periodStart: 'a',
      periodEnd: 'b',
      provider: 'deepseek',
      snapshotHash: 'hash-1',
      snapshotJson: '{}',
      advice: sampleAdvice(),
    });
    await saveCachedAdvice(db, {
      periodPreset: 'last_30_days',
      periodStart: 'c',
      periodEnd: 'd',
      provider: 'gemini',
      snapshotHash: 'hash-2',
      snapshotJson: '{}',
      advice: { ...sampleAdvice(), summary: 'Segundo análisis' },
    });
    const cached = await getCachedAdvice(db);
    expect(cached?.snapshotHash).toBe('hash-2');
    expect(cached?.advice.summary).toBe('Segundo análisis');
  });

  it('descartar una recomendación la marca como dismissed sin tocar las demás', async () => {
    const db = await freshDb();
    const advice = sampleAdvice();
    advice.recommendations.push({ ...advice.recommendations[0], id: 'rec-2', title: 'Otra' });
    await saveCachedAdvice(db, {
      periodPreset: 'current_month',
      periodStart: 'a',
      periodEnd: 'b',
      provider: 'deepseek',
      snapshotHash: 'hash-1',
      snapshotJson: '{}',
      advice,
    });

    const updated = await dismissRecommendation(db, 'rec-1');
    expect(updated?.advice.recommendations.find((r) => r.id === 'rec-1')?.dismissed).toBe(true);
    expect(updated?.advice.recommendations.find((r) => r.id === 'rec-2')?.dismissed).toBeFalsy();
    // El hash no cambia: descartar no invalida la caché.
    expect(updated?.snapshotHash).toBe('hash-1');
  });

  it('clearCachedAdvice borra el análisis almacenado', async () => {
    const db = await freshDb();
    await saveCachedAdvice(db, {
      periodPreset: 'current_month',
      periodStart: 'a',
      periodEnd: 'b',
      provider: 'deepseek',
      snapshotHash: 'hash-1',
      snapshotJson: '{}',
      advice: sampleAdvice(),
    });
    await clearCachedAdvice(db);
    expect(await getCachedAdvice(db)).toBeNull();
  });
});
