/** Redondea a 2 decimales evitando errores de coma flotante binaria. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * División segura: devuelve null (no 0 ni Infinity) cuando el resultado no
 * está definido, para no fabricar una tasa artificial (p. ej. sin ingresos).
 */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/** Promedio simple; 0 para un array vacío (no NaN). */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Variación porcentual de current respecto de previous. null cuando no hay
 * base de comparación válida (previous = 0 y current > 0: % indefinido, no 0
 * ni Infinity).
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}
