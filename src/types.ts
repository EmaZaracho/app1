import type { BudgetPeriod } from './domain/budgetPeriod';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ParsedReceipt } from './services/receiptTypes';
import type { RecurringRuleInput } from './types/recurringExpenses';

export const EXPENSE_CATEGORIES = [
  'Comida',
  'Transporte',
  'Vivienda',
  'Ocio',
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

/** Todos los tipos de movimiento del dominio. */
export type MovementType = 'gasto' | 'ingreso' | 'transferencia' | 'ajuste';

/** Tipos que la IA puede interpretar a partir de lenguaje natural. */
export type AIMovementType = 'gasto' | 'ingreso' | 'transferencia';

/** Tipos que llevan categoría obligatoria. */
export type CategorizedMovementType = 'gasto' | 'ingreso';

export type AIProvider = 'deepseek' | 'gemini';

export const AI_PROVIDERS: { id: AIProvider; label: string; keyUrl: string; model: string }[] = [
  { id: 'deepseek', label: 'DeepSeek', keyUrl: 'https://platform.deepseek.com', model: 'deepseek-flash' },
  { id: 'gemini', label: 'Gemini', keyUrl: 'https://aistudio.google.com/apikey', model: 'gemini-3.5-flash-lite' },
];

export function categoriesForType(type: CategorizedMovementType): readonly Category[] {
  return type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function isCategorizedType(type: MovementType): type is CategorizedMovementType {
  return type === 'gasto' || type === 'ingreso';
}

export function isValidCategoryForType(category: string, type: CategorizedMovementType): category is Category {
  return (categoriesForType(type) as readonly string[]).includes(category);
}

// ---------------------------------------------------------------------------
// Fondos
// ---------------------------------------------------------------------------

export interface Fund {
  id: number;
  name: string;
  normalizedName: string;
  icon: string;
  color: string;
  isDefault: boolean;
  isArchived: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FundAlias {
  id: number;
  fundId: number;
  alias: string;
  normalizedAlias: string;
}

/** Un fondo con sus alias y saldo calculado, listo para la UI. */
export interface FundWithBalance extends Fund {
  aliases: FundAlias[];
  balance: number;
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export interface Movement {
  id: number;
  type: MovementType;
  amount: number;
  category: Category | null;
  description: string;
  rawText: string;
  sourceFundId: number | null;
  destinationFundId: number | null;
  createdAt: string;
  /** Compra de varios a la que pertenece (factura leída), o null si es un gasto suelto. */
  purchaseId: number | null;
}

/** Datos de un movimiento listos para insertar (sin id ni fecha). */
export interface NewMovement {
  type: MovementType;
  amount: number;
  category: Category | null;
  description: string;
  rawText: string;
  sourceFundId: number | null;
  destinationFundId: number | null;
}

export interface Budget {
  category: ExpenseCategory;
  /** Límite de gasto por ciclo del período elegido (semanal, quincenal o mensual). */
  limit: number;
  period: BudgetPeriod;
  /** Inicio (YYYY-MM-DD) de los ciclos semanales/quincenales; null en mensuales. */
  anchorDate: string | null;
}

/** Filtro que una pantalla externa (p. ej. Análisis financiero) le pide a Home que aplique. */
export interface HomeMovementFilter {
  type?: MovementType;
  category?: Category;
  periodStart?: string;
  /** Exclusivo, coherente con el resto de las consultas de la app. */
  periodEnd?: string;
}

/** Las cuatro pestañas raíz, siempre con la barra inferior visible. */
export type MainTabParamList = {
  HomeTab:
    | { deletedMovement?: Movement; deletedOccurrenceId?: number; filter?: HomeMovementFilter }
    | undefined;
  CalendarTab: undefined;
  SummaryTab: undefined;
  SettingsTab: undefined;
};

/**
 * Formularios y detalles: se presentan por encima de MainTabs, así que la
 * barra inferior queda oculta automáticamente por la jerarquía de navegadores.
 */
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  MovementForm: { initialType?: AIMovementType } | undefined;
  Budgets: undefined;
  Funds: undefined;
  FundEditor: { fundId?: number } | undefined;
  MovementDetail: { movementId: number };
  FinancialInsights: undefined;
  CategoryPrioritySettings: undefined;
  CategoryKeywords: undefined;
  PurchaseDetail: { purchaseId: number };
  ReceiptReview: { receipt: ParsedReceipt };
  RecurringExpenseEditor: { ruleId?: number; draft?: RecurringRuleInput } | undefined;
  RecurringExpenseDetail: { ruleId: number };
  RecurringOccurrenceDetail: { occurrenceId: number };
  RegisterOccurrencePayment: { occurrenceId: number };
};
