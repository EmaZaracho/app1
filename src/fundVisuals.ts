// Selección de emojis para elegir el icono de un fondo (sin dependencias extra).
export const FUND_ICONS = [
  '💵',
  '💳',
  '🏦',
  '📱',
  '🐷',
  '💰',
  '🪙',
  '💸',
  '🧾',
  '🏧',
  '🛒',
  '⭐',
] as const;

// Paleta de colores para fondos: 8 tonos de la paleta categórica validada
// (mismos valores claro/oscuro elegidos por contraste y distinción CVD).
export const FUND_COLORS = [
  '#2a78d6',
  '#008300',
  '#e87ba4',
  '#eda100',
  '#1baf7a',
  '#eb6834',
  '#4a3aa7',
  '#e34948',
] as const;

export const DEFAULT_FUND_ICON = '💵';
export const DEFAULT_FUND_COLOR = '#008300';
