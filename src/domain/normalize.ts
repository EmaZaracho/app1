const DIACRITICS = /[̀-ͯ]/g;
const REPEATED_SPACES = /\s+/g;

/**
 * Normaliza un nombre o alias de fondo para comparaciones tolerantes:
 * ignora mayúsculas/minúsculas, espacios sobrantes y repetidos, y acentos.
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .trim()
    .replace(REPEATED_SPACES, ' ');
}

/** Devuelve true si dos nombres/alias son equivalentes tras normalizar. */
export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}
