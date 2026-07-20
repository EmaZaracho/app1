import type { ExpenseCategory } from '../types';

/**
 * Forma EXTERNA cruda de la respuesta de Gemini (antes de validar). Se
 * mantiene separada del tipo interno ya validado, mismo criterio que
 * AIMovementResponse / FinancialAdviceInput.
 */
export interface ReceiptItemAI {
  description: string;
  amount: number;
  category: string;
}

export interface ReceiptResponseAI {
  merchantName: string | null;
  items: ReceiptItemAI[];
  /** Total impreso en el ticket, si es legible. Solo referencia, no se usa para el registro. */
  totalAmount: number | null;
}

/** Ítem ya validado localmente contra EXPENSE_CATEGORIES, listo para editar/confirmar en la UI. */
export interface ReceiptItem {
  description: string;
  amount: number;
  category: ExpenseCategory;
}

export interface ParsedReceipt {
  merchantName: string | null;
  items: ReceiptItem[];
  totalAmount: number | null;
}
