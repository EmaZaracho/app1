import type { MovementType } from '../types';

export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSignedCurrency(amount: number, type: MovementType): string {
  const sign = type === 'ingreso' ? '+' : '-';
  return `${sign}${formatCurrency(amount)}`;
}
