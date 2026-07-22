/** Debe coincidir con expo.version en app.json: fallback cuando el nativo no está disponible (Expo Go / dev). */
export const CONFIGURED_VERSION = '1.1.0';

export interface VersionInfo {
  version: string;
  build: string;
}

/**
 * Formatea la info de versión visible en Ajustes a partir de los valores
 * nativos de `expo-application` (que pueden ser null en Expo Go o si el
 * módulo no está disponible). Nunca expone IDs internos de EAS ni updateId.
 */
export function formatVersionInfo(nativeVersion: string | null, nativeBuild: string | null): VersionInfo {
  return {
    version: nativeVersion ?? CONFIGURED_VERSION,
    build: nativeBuild ?? 'No disponible',
  };
}
