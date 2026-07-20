import type { DataQuality, DataQualityLevel } from '../types/financialAnalytics';

const INSUFFICIENT_MAX = 4; // < 5 movimientos: insuficiente
const LIMITED_MAX = 14; // 5-14: limitada; >= 15: suficiente

/**
 * Heurística de PRODUCTO (no una fórmula estadística formal) para señalar
 * cuándo la evidencia de un período es floja: pocos movimientos, o
 * movimientos muy concentrados en pocos días respecto a la duración del
 * período (ej. 15 movimientos pero todos el mismo día no son tan
 * representativos de todo el período como 15 movimientos repartidos).
 */
export function computeDataQuality(
  movementCount: number,
  activeDays: number,
  periodDays: number
): DataQuality {
  let level: DataQualityLevel;
  if (movementCount <= INSUFFICIENT_MAX) level = 'insufficient';
  else if (movementCount <= LIMITED_MAX) level = 'limited';
  else level = 'sufficient';

  // Degradar de "sufficient" a "limited" si la actividad está muy concentrada
  // en pocos días dentro de un período de más de una semana.
  if (level === 'sufficient' && activeDays <= 2 && periodDays > 7) {
    level = 'limited';
  }

  const messages: Record<DataQualityLevel, string | null> = {
    insufficient:
      'Necesitás al menos 5 gastos o ingresos registrados en el período para generar un análisis.',
    limited:
      'Hay pocos movimientos (o están muy concentrados en pocos días) en este período: tratá estas métricas como una referencia aproximada.',
    sufficient: null,
  };

  return { movementCount, activeDays, level, message: messages[level] };
}
