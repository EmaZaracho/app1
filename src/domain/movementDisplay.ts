import type { Movement } from '../types';

export type DisplayContext = { kind: 'total' } | { kind: 'fund'; fundId: number };

export interface MovementDisplay {
  /** Monto con signo aplicado según el contexto. null => neutral (transferencia en Total). */
  signedAmount: number | null;
  neutral: boolean;
  /** Etiqueta principal (categoría o tipo). */
  label: string;
  /** Nota de contexto para transferencias: "→ Destino" o "← Origen". */
  contextNote?: string;
}

/**
 * Calcula cómo se muestra un movimiento en la vista Total o en la de un fondo.
 * Un mismo movimiento (una transferencia) se representa distinto en cada fondo.
 */
export function describeMovement(
  m: Movement,
  context: DisplayContext,
  fundName: (id: number) => string
): MovementDisplay {
  if (context.kind === 'total') {
    switch (m.type) {
      case 'gasto':
        return { signedAmount: -m.amount, neutral: false, label: m.category ?? 'Gasto' };
      case 'ingreso':
        return { signedAmount: m.amount, neutral: false, label: m.category ?? 'Ingreso' };
      case 'transferencia':
        return {
          signedAmount: null,
          neutral: true,
          label: 'Transferencia',
          contextNote: `${fundName(m.sourceFundId!)} → ${fundName(m.destinationFundId!)}`,
        };
      case 'ajuste':
        return {
          signedAmount: m.destinationFundId != null ? m.amount : -m.amount,
          neutral: false,
          label: 'Ajuste',
        };
    }
  }

  const fundId = context.fundId;
  switch (m.type) {
    case 'gasto':
      return { signedAmount: -m.amount, neutral: false, label: m.category ?? 'Gasto' };
    case 'ingreso':
      return { signedAmount: m.amount, neutral: false, label: m.category ?? 'Ingreso' };
    case 'transferencia':
      if (m.sourceFundId === fundId) {
        return {
          signedAmount: -m.amount,
          neutral: false,
          label: 'Transferencia',
          contextNote: `→ ${fundName(m.destinationFundId!)}`,
        };
      }
      return {
        signedAmount: m.amount,
        neutral: false,
        label: 'Transferencia',
        contextNote: `← ${fundName(m.sourceFundId!)}`,
      };
    case 'ajuste':
      return {
        signedAmount: m.destinationFundId === fundId ? m.amount : -m.amount,
        neutral: false,
        label: 'Ajuste',
      };
  }
}
