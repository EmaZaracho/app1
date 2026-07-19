export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
