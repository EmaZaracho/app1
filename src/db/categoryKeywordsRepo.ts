import { isValidCategoryForType, type ExpenseCategory } from '../types';
import type { SqlDatabase } from './sqlDatabase';

export interface CategoryKeyword {
  keyword: string;
  category: ExpenseCategory;
}

export const MAX_KEYWORD_LENGTH = 40;

/** Minúsculas, sin espacios de más: "  Delivery  " y "delivery" son la misma palabra. */
export function normalizeKeyword(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_KEYWORD_LENGTH);
}

export type AddKeywordResult = { ok: true } | { ok: false; error: string };

export async function getCategoryKeywords(db: SqlDatabase): Promise<CategoryKeyword[]> {
  const rows = await db.getAllAsync<{ keyword: string; category: string }>(
    'SELECT keyword, category FROM category_keywords ORDER BY keyword'
  );
  return rows
    .filter((row) => isValidCategoryForType(row.category, 'gasto'))
    .map((row) => ({ keyword: row.keyword, category: row.category as ExpenseCategory }));
}

/** Una palabra pertenece a una sola categoría: si ya está en otra, no se pisa. */
export async function addCategoryKeyword(
  db: SqlDatabase,
  category: ExpenseCategory,
  rawKeyword: string
): Promise<AddKeywordResult> {
  const keyword = normalizeKeyword(rawKeyword);
  if (!keyword) return { ok: false, error: 'Escribí una palabra.' };
  const existing = await db.getFirstAsync<{ category: string }>(
    'SELECT category FROM category_keywords WHERE keyword = ?',
    [keyword]
  );
  if (existing) {
    return {
      ok: false,
      error:
        existing.category === category
          ? 'Esa palabra ya está en esta categoría.'
          : `Esa palabra ya está en ${existing.category}.`,
    };
  }
  await db.runAsync('INSERT INTO category_keywords (keyword, category) VALUES (?, ?)', [keyword, category]);
  return { ok: true };
}

export async function removeCategoryKeyword(db: SqlDatabase, keyword: string): Promise<void> {
  await db.runAsync('DELETE FROM category_keywords WHERE keyword = ?', [keyword]);
}
