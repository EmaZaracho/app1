import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, categoriesForType, isValidCategoryForType } from './types';

describe('categoriesForType', () => {
  it('returns expense categories for gasto', () => {
    expect(categoriesForType('gasto')).toEqual(EXPENSE_CATEGORIES);
  });

  it('returns income categories for ingreso', () => {
    expect(categoriesForType('ingreso')).toEqual(INCOME_CATEGORIES);
  });
});

describe('isValidCategoryForType', () => {
  it('accepts a category that belongs to the given type', () => {
    expect(isValidCategoryForType('Comida', 'gasto')).toBe(true);
    expect(isValidCategoryForType('Sueldo', 'ingreso')).toBe(true);
  });

  it('rejects a category that belongs to the other type', () => {
    expect(isValidCategoryForType('Sueldo', 'gasto')).toBe(false);
    expect(isValidCategoryForType('Comida', 'ingreso')).toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(isValidCategoryForType('Inventado', 'gasto')).toBe(false);
  });

  it('accepts "Otros" for both types', () => {
    expect(isValidCategoryForType('Otros', 'gasto')).toBe(true);
    expect(isValidCategoryForType('Otros', 'ingreso')).toBe(true);
  });
});
