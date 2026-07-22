import { MAIN_TABS, ROOT_ONLY_SCREENS } from '../src/navigation/navigationConfig';

describe('MAIN_TABS', () => {
  it('define exactamente las cuatro pestañas requeridas, en orden', () => {
    expect(MAIN_TABS.map((t) => t.name)).toEqual(['HomeTab', 'CalendarTab', 'SummaryTab', 'SettingsTab']);
  });

  it('usa etiquetas en español', () => {
    const labels = Object.fromEntries(MAIN_TABS.map((t) => [t.name, t.label]));
    expect(labels).toEqual({
      HomeTab: 'Inicio',
      CalendarTab: 'Calendario',
      SummaryTab: 'Resumen',
      SettingsTab: 'Ajustes',
    });
  });

  it('cada pestaña tiene un ícono no vacío', () => {
    for (const tab of MAIN_TABS) {
      expect(tab.icon.length).toBeGreaterThan(0);
    }
  });
});

describe('ROOT_ONLY_SCREENS', () => {
  it('incluye los formularios y detalles que deben ocultar la barra inferior', () => {
    expect(ROOT_ONLY_SCREENS).toEqual(
      expect.arrayContaining([
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
      ])
    );
  });

  it('no incluye ninguna de las cuatro pestañas raíz', () => {
    const tabNames = MAIN_TABS.map((t) => t.name);
    for (const screen of ROOT_ONLY_SCREENS) {
      expect(tabNames).not.toContain(screen);
    }
  });

  it('no incluye MainTabs (es la envoltura, no una pantalla "solo root")', () => {
    expect(ROOT_ONLY_SCREENS).not.toContain('MainTabs');
  });
});
