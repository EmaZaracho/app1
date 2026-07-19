import type { AIMovementType } from '../types';

/**
 * Forma EXTERNA de la respuesta de la IA (nombres de fondos como texto).
 * Se mantiene separada de los tipos internos del dominio: el parser local la
 * valida y recién después resuelve los nombres contra fondos reales.
 */
export interface AIMovementResponse {
  type: AIMovementType;
  amount: number;
  category: string | null;
  description: string;
  sourceFund: string | null;
  destinationFund: string | null;
}

/** Fondo activo tal como se le informa a la IA (nombre canónico + alias). */
export interface AIFundInfo {
  name: string;
  aliases: string[];
}
