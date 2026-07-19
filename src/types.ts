export const CATEGORIES = [
  'Comida',
  'Transporte',
  'Vivienda',
  'Entretenimiento',
  'Salud',
  'Compras',
  'Servicios',
  'Otros',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Expense {
  id: number;
  amount: number;
  category: Category;
  description: string;
  rawText: string;
  createdAt: string;
}

export interface ParsedExpense {
  amount: number;
  category: Category;
  description: string;
}

export type RootStackParamList = {
  Home: undefined;
  Summary: undefined;
  Settings: undefined;
  ExpenseDetail: { expenseId: number };
};
