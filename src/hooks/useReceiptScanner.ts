import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { AIProviderError } from '../services/ai';
import { scanReceipt } from '../services/receiptScan';
import type { ParsedReceipt } from '../services/receiptTypes';

export interface UseReceiptScannerResult {
  scanning: boolean;
  error: string | null;
  /** Requiere Gemini específicamente (visión); si no hay key, llama a `onMissingGeminiKey` en vez de escanear. */
  startScan: (geminiKey: string | null, onMissingGeminiKey: () => void) => void;
}

/**
 * Flujo completo de escaneo de comprobante: elegir origen (cámara/galería),
 * pedir permisos, capturar, redimensionar/comprimir y llamar a Gemini
 * Vision. La navegación a la revisión queda a cargo del llamador vía
 * `onScanned`, para no acoplar el hook a un tipo de navegación concreto.
 */
export function useReceiptScanner(onScanned: (receipt: ParsedReceipt) => void): UseReceiptScannerResult {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureAndScan = useCallback(
    async (source: 'camera' | 'library', geminiKey: string) => {
      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError(
            `Necesitás dar permiso de ${source === 'camera' ? 'cámara' : 'galería'} para escanear una factura.`
          );
          return;
        }

        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
            : await ImagePicker.launchImageLibraryAsync({ quality: 0.9, mediaTypes: ['images'] });

        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];

        setError(null);
        setScanning(true);

        // Redimensionar al lado mayor <= 1600px (preservando aspecto) antes de
        // comprimir a JPEG ~0.7: no gastar de más en tokens/tiempo de subida.
        const maxSide = Math.max(asset.width, asset.height);
        const scale = maxSide > 1600 ? 1600 / maxSide : 1;
        let context = ImageManipulator.manipulate(asset.uri);
        if (scale < 1) {
          context = context.resize({ width: Math.round(asset.width * scale) });
        }
        const rendered = await context.renderAsync();
        const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });

        if (!saved.base64) {
          setError('No se pudo procesar la imagen.');
          return;
        }

        const parsed = await scanReceipt(saved.base64, geminiKey);
        if (parsed.items.length === 0) {
          Alert.alert(
            'No se detectaron productos',
            'No pudimos identificar productos en la foto. Probá con otra imagen más clara.'
          );
          return;
        }
        onScanned(parsed);
      } catch (err) {
        setError(err instanceof AIProviderError ? err.message : 'No se pudo procesar la factura.');
      } finally {
        setScanning(false);
      }
    },
    [onScanned]
  );

  const startScan = useCallback(
    (geminiKey: string | null, onMissingGeminiKey: () => void) => {
      if (!geminiKey) {
        onMissingGeminiKey();
        return;
      }
      Alert.alert('Escanear factura', 'Elegí el origen de la foto', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Tomar foto', onPress: () => captureAndScan('camera', geminiKey) },
        { text: 'Elegir de la galería', onPress: () => captureAndScan('library', geminiKey) },
      ]);
    },
    [captureAndScan]
  );

  return { scanning, error, startScan };
}
