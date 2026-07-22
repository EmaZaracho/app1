import type { MainTabParamList, RootStackParamList } from '../types';

export interface TabConfigEntry {
  name: keyof MainTabParamList;
  label: string;
  icon: string;
}

/** Las cuatro pestañas raíz, en el orden en que se muestran en la barra inferior. */
export const MAIN_TABS: readonly TabConfigEntry[] = [
  { name: 'HomeTab', label: 'Inicio', icon: '🏠' },
  { name: 'CalendarTab', label: 'Calendario', icon: '📅' },
  { name: 'SummaryTab', label: 'Resumen', icon: '📊' },
  { name: 'SettingsTab', label: 'Ajustes', icon: '⚙️' },
] as const;

/** Pantallas del RootStack que se presentan por encima de MainTabs (ocultan la barra inferior). */
export const ROOT_ONLY_SCREENS: readonly Exclude<keyof RootStackParamList, 'MainTabs'>[] = [
  'MovementForm',
  'MovementDetail',
  'ReceiptReview',
  'Funds',
  'FundEditor',
  'Budgets',
  'FinancialInsights',
  'CategoryPrioritySettings',
  'RecurringExpenseEditor',
  'RecurringExpenseDetail',
  'RecurringOccurrenceDetail',
  'RegisterOccurrencePayment',
] as const;
