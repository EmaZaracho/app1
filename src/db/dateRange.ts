export interface DateRange {
  start: string;
  end: string;
}

/** Rango [inicio, fin) del mes actual en ISO, para consultas mensuales. */
export function currentMonthRange(now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { start, end };
}
