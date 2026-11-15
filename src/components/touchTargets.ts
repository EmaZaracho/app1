/**
 * Área táctil extra para los chips (alto visual de 36): con 6 arriba y abajo el
 * objetivo llega a 48, el mínimo que recomienda Material Design (Apple pide 44).
 */
export const CHIP_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

/** Área táctil extra para botones de solo ícono o flecha (‹ › ✕), que visualmente son más chicos que un dedo. */
export const ARROW_HIT_SLOP = { top: 12, bottom: 12, left: 10, right: 10 } as const;
