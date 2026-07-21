import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';

const LAST_SEEN_UPDATE_ID_KEY = 'last_seen_update_id';

/**
 * true si el update OTA que se acaba de aplicar es distinto al último visto
 * (guarda el id actual para la próxima llamada). false en el primer arranque
 * de una instalación, o si expo-updates está deshabilitado (dev, Expo Go).
 */
export async function checkForNewlyAppliedUpdate(): Promise<boolean> {
  const currentId = Updates.updateId;
  if (currentId == null) return false;
  const lastSeenId = await SecureStore.getItemAsync(LAST_SEEN_UPDATE_ID_KEY);
  await SecureStore.setItemAsync(LAST_SEEN_UPDATE_ID_KEY, currentId);
  return lastSeenId != null && lastSeenId !== currentId;
}
