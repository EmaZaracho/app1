export const EXPENSE_CATEGORIES = [
  'Comida',
  'Transporte',
  'Vivienda',
  'Entretenimiento',
  'Salud',
  'Compras',
  'Servicios',
  'Otros',
] as const;

export const INCOME_CATEGORIES = [
  'Sueldo',
  'Freelance',
  'Inversiones',
  'Regalo',
  'Otros',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type Category = ExpenseCategory | IncomeCategory;

export type MovementType = 'gasto' | 'ingreso';

export type AIProvider = 'deepseek' | 'gemini';

export const AI_PROVIDERS: { id: AIProvider; label: string; keyUrl: string }[] = [
  { id: 'deepseek', label: 'DeepSeek', keyUrl: 'https://platform.deepseek.com' },
  { id: 'gemini', label: 'Gemini', keyUrl: 'https://aistudio.google.com/apikey' },
];

export function categoriesForType(type: MovementType): readonly Category[] {
  return type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function isValidCategoryForType(category: string, type: MovementType): category is Category {
  return (categoriesForType(type) as readonly string[]).includes(category);
}

export interface Movement {
  id: number;
  type: MovementType;
  amount: number;
  category: Category;
  description: string;
  rawText: string;
  createdAt: string;
}

export interface ParsedMovement {
  type: MovementType;
  amount: number;
  category: Category;
  description: string;
}

export interface Budget {
  category: ExpenseCategory;
  monthlyLimit: number;
}

export type RootStackParamList = {
  Home: { deletedMovement?: Movement } | undefined;
  Summary: undefined;
  Settings: undefined;
  Budgets: undefined;
  MovementDetail: { movementId: number };
};
