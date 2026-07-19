import { normalizeName } from './normalize';

/** Objetivo mínimo para resolver un nombre/alias contra un fondo. */
export interface FundMatchTarget {
  id: number;
  name: string;
  normalizedName: string;
  aliases: { normalizedAlias: string }[];
}

export type FundMatchResult =
  | { status: 'matched'; fundId: number }
  | { status: 'not_found' }
  | { status: 'ambiguous'; fundIds: number[] };

/**
 * Resuelve un texto (nombre o alias, tal cual lo mencionó el usuario o la IA)
 * contra la lista de fondos. La comparación ignora mayúsculas, espacios y acentos.
 * Devuelve el id del fondo, "no encontrado", o "ambiguo" si el término matchea
 * con más de un fondo distinto.
 */
export function resolveFundReference(
  query: string | null | undefined,
  targets: FundMatchTarget[]
): FundMatchResult {
  if (query == null) return { status: 'not_found' };
  const normalized = normalizeName(query);
  if (!normalized) return { status: 'not_found' };

  const matchedIds = new Set<number>();
  for (const target of targets) {
    if (target.normalizedName === normalized) {
      matchedIds.add(target.id);
      continue;
    }
    if (target.aliases.some((a) => a.normalizedAlias === normalized)) {
      matchedIds.add(target.id);
    }
  }

  if (matchedIds.size === 0) return { status: 'not_found' };
  if (matchedIds.size === 1) return { status: 'matched', fundId: [...matchedIds][0] };
  return { status: 'ambiguous', fundIds: [...matchedIds] };
}

/**
 * Detecta si un nombre canónico o alias entra en conflicto con los fondos
 * activos existentes (nombres y alias). `excludeFundId` permite ignorar el
 * propio fondo al editarlo. Devuelve los términos en conflicto.
 */
export function findNameConflicts(
  candidateTerms: string[],
  targets: FundMatchTarget[],
  excludeFundId?: number
): string[] {
  const relevant = targets.filter((t) => t.id !== excludeFundId);
  const taken = new Set<string>();
  for (const target of relevant) {
    taken.add(target.normalizedName);
    for (const alias of target.aliases) taken.add(alias.normalizedAlias);
  }

  const conflicts: string[] = [];
  const seenInCandidate = new Set<string>();
  for (const term of candidateTerms) {
    const normalized = normalizeName(term);
    if (!normalized) continue;
    if (taken.has(normalized) || seenInCandidate.has(normalized)) {
      conflicts.push(term);
    }
    seenInCandidate.add(normalized);
  }
  return conflicts;
}
