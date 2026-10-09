import {
  addCategoryKeyword,
  getCategoryKeywords,
  normalizeKeyword,
  removeCategoryKeyword,
} from '../src/db/categoryKeywordsRepo';
import { buildMovementPrompt } from '../src/services/movementPrompt';
import { freshDb } from './helpers';

describe('palabras clave por categoría', () => {
  it('normaliza y guarda una palabra por categoría', async () => {
    const db = await freshDb();
    expect(normalizeKeyword('  Delivery   Rápido ')).toBe('delivery rápido');

    expect(await addCategoryKeyword(db, 'Ocio', '  Delivery ')).toEqual({ ok: true });
    expect(await getCategoryKeywords(db)).toEqual([{ keyword: 'delivery', category: 'Ocio' }]);
  });

  it('rechaza vacías y repetidas, también en otra categoría', async () => {
    const db = await freshDb();
    await addCategoryKeyword(db, 'Ocio', 'delivery');

    expect(await addCategoryKeyword(db, 'Ocio', '   ')).toMatchObject({ ok: false });
    expect(await addCategoryKeyword(db, 'Ocio', 'DELIVERY')).toEqual({
      ok: false,
      error: 'Esa palabra ya está en esta categoría.',
    });
    expect(await addCategoryKeyword(db, 'Comida', 'delivery')).toEqual({
      ok: false,
      error: 'Esa palabra ya está en Ocio.',
    });
    expect(await getCategoryKeywords(db)).toHaveLength(1);
  });

  it('permite quitar una palabra', async () => {
    const db = await freshDb();
    await addCategoryKeyword(db, 'Ocio', 'delivery');
    await removeCategoryKeyword(db, 'delivery');
    expect(await getCategoryKeywords(db)).toEqual([]);
  });

  it('el prompt incluye las palabras agrupadas por categoría y no cambia si no hay ninguna', () => {
    const base = buildMovementPrompt([]);
    expect(buildMovementPrompt([], [])).toBe(base);

    const prompt = buildMovementPrompt([], [
      { keyword: 'delivery', category: 'Ocio' },
      { keyword: 'cine', category: 'Ocio' },
      { keyword: 'nafta', category: 'Transporte' },
    ]);
    expect(prompt).toContain('- Ocio: delivery, cine');
    expect(prompt).toContain('- Transporte: nafta');
  });
});
