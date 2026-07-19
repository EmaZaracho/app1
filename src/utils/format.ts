export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formatea un monto con signo explícito (+/-) según su signo numérico.
 * Se usa cuando el signo depende del contexto (p. ej. una transferencia es
 * negativa en el fondo de origen y positiva en el de destino).
 */
export function formatSignedCurrency(signedAmount: number): string {
  const prefix = signedAmount > 0 ? '+' : signedAmount < 0 ? '-' : '';
  return `${prefix}$${Math.abs(signedAmount).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
