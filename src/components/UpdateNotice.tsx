import { useEffect } from 'react';
import { Alert } from 'react-native';
import { checkForNewlyAppliedUpdate } from '../services/updateNotice';

/** Muestra un aviso una sola vez cuando la app arranca con un update OTA nuevo. */
export function UpdateNotice() {
  useEffect(() => {
    checkForNewlyAppliedUpdate().then((isNew) => {
      if (isNew) {
        Alert.alert('App actualizada', 'Se aplicaron las últimas mejoras y correcciones.');
      }
    });
  }, []);

  return null;
}
