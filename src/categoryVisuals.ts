import type { Category } from './types';

export const CATEGORY_ICON: Record<Category, string> = {
  Comida: '🍔',
  Transporte: '🚗',
  Vivienda: '🏠',
  Entretenimiento: '🎬',
  Salud: '🏥',
  Compras: '🛍️',
  Servicios: '💡',
  Sueldo: '💼',
  Freelance: '💻',
  Inversiones: '📈',
  Regalo: '🎁',
  Otros: '📦',
};

export function iconForCategory(category: Category): string {
  return CATEGORY_ICON[category] ?? '📦';
}

// Fixed hue order from the validated 8-slot categorical palette (never cycled).
const SLOT = {
  blue: { light: '#2a78d6', dark: '#3987e5' },
  green: { light: '#008300', dark: '#008300' },
  magenta: { light: '#e87ba4', dark: '#d55181' },
  yellow: { light: '#eda100', dark: '#c98500' },
  aqua: { light: '#1baf7a', dark: '#199e70' },
  orange: { light: '#eb6834', dark: '#d95926' },
  violet: { light: '#4a3aa7', dark: '#9085e9' },
  red: { light: '#e34948', dark: '#e66767' },
};

const CATEGORY_SLOT: Record<Category, keyof typeof SLOT> = {
  Comida: 'blue',
  Transporte: 'green',
  Vivienda: 'magenta',
  Entretenimiento: 'yellow',
  Salud: 'aqua',
  Compras: 'orange',
  Servicios: 'violet',
  Otros: 'red',
  Sueldo: 'blue',
  Freelance: 'green',
  Inversiones: 'magenta',
  Regalo: 'yellow',
};

export function colorForCategory(category: Category, scheme: 'light' | 'dark'): string {
  const slot = CATEGORY_SLOT[category] ?? 'red';
  return SLOT[slot][scheme];
}
