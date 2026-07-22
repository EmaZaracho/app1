import { useCallback, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { addMovement } from '../db/database';
import { getFundMatchTargets } from '../db/fundsRepo';
import { getApiKey, getSelectedProvider } from '../services/apiKey';
import { AIProviderError, parseMovement, resolveAIMovement } from '../services/ai';
import { buildNewMovement, computeFundSelection } from '../domain/movementRules';
import { AI_PROVIDERS } from '../types';
import type { SqlDatabase } from '../db/sqlDatabase';
import type { AIMovementType, AIProvider, Category, FundWithBalance, NewMovement } from '../types';

/** Valores iniciales de una vista previa de IA a completar/confirmar. `key` fuerza un remount limpio del form por cada resultado nuevo. */
export interface PreviewInit {
  key: number;
  type: AIMovementType;
  amountText: string;
  category: Category | null;
  description: string;
  sourceFundId: number | null;
  destinationFundId: number | null;
  rawText: string;
}

export interface UseMovementComposerResult {
  text: string;
  setText: (v: string) => void;
  loading: boolean;
  error: string | null;
  hasApiKey: boolean;
  activeProvider: AIProvider;
  preview: PreviewInit | null;
  handleParse: () => Promise<void>;
  handleCancelPreview: () => void;
  handleConfirmPreview: (movement: NewMovement) => Promise<void>;
}

function providerLabel(id: AIProvider): string {
  return AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/**
 * Compositor de lenguaje natural: texto, estado de parsing, proveedor activo,
 * disponibilidad de API key, vista previa y su confirmación/cancelación. La
 * ausencia de API key SOLO bloquea "Registrar con IA" (setea hasApiKey=false
 * y un mensaje), nunca el registro manual, transferencias, calendario o
 * escaneo (ese último tiene su propio requisito de Gemini en
 * `useReceiptScanner`).
 */
export function useMovementComposer(
  db: SqlDatabase,
  funds: FundWithBalance[],
  defaultFundId: number | null,
  onSaved: () => Promise<void> | void
): UseMovementComposerResult {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [activeProvider, setActiveProvider] = useState<AIProvider>('deepseek');
  const [preview, setPreview] = useState<PreviewInit | null>(null);
  const previewKeyRef = useRef(0);

  const refreshApiKeyStatus = useCallback(async () => {
    const provider = await getSelectedProvider();
    const apiKey = await getApiKey(provider);
    setActiveProvider(provider);
    setHasApiKey(!!apiKey);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshApiKeyStatus();
    }, [refreshApiKeyStatus])
  );

  const handleParse = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);
    try {
      const provider = await getSelectedProvider();
      const apiKey = await getApiKey(provider);
      if (!apiKey) {
        setError(`Configurá tu API key de ${providerLabel(provider)} antes de agregar movimientos con IA.`);
        setHasApiKey(false);
        setActiveProvider(provider);
        return;
      }
      const aiFunds = funds.map((f) => ({ name: f.name, aliases: f.aliases.map((a) => a.alias) }));
      const aiResponse = await parseMovement(trimmed, provider, apiKey, aiFunds);
      const targets = await getFundMatchTargets(db, true);
      const resolved = resolveAIMovement(aiResponse, targets);

      const selection = computeFundSelection({
        type: resolved.type,
        resolvedSourceId: resolved.sourceFundId,
        resolvedDestId: resolved.destinationFundId,
        activeFunds: funds.map((f) => ({ id: f.id, isDefault: f.isDefault })),
        defaultFundId,
      });

      // Entrada clara y no ambigua: se confirma automáticamente.
      if (selection.canConfirm && Number.isFinite(resolved.amount) && resolved.amount > 0) {
        const movement = buildNewMovement(
          resolved.type,
          resolved.amount,
          resolved.category,
          resolved.description || trimmed,
          trimmed,
          selection.sourceFundId,
          selection.destinationFundId
        );
        await addMovement(db, movement);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setText('');
        await onSaved();
        return;
      }

      // Entrada ambigua o incompleta: vista previa editable para completar.
      previewKeyRef.current += 1;
      setPreview({
        key: previewKeyRef.current,
        type: resolved.type,
        amountText: String(resolved.amount),
        category: resolved.category,
        // Nunca vacía: si la IA no trajo descripción, se usa el texto original
        // (el formulario compartido exige descripción no vacía).
        description: resolved.description?.trim() || trimmed,
        sourceFundId: selection.sourceFundId,
        destinationFundId: selection.destinationFundId,
        rawText: trimmed,
      });
      setText('');
    } catch (err) {
      setError(err instanceof AIProviderError ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  }, [text, loading, funds, defaultFundId, db, onSaved]);

  const handleCancelPreview = useCallback(() => {
    setPreview((prev) => {
      if (prev) setText(prev.rawText);
      return null;
    });
  }, []);

  const handleConfirmPreview = useCallback(
    async (movement: NewMovement) => {
      try {
        await addMovement(db, movement);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPreview(null);
        setError(null);
        await onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
      }
    },
    [db, onSaved]
  );

  return {
    text,
    setText,
    loading,
    error,
    hasApiKey,
    activeProvider,
    preview,
    handleParse,
    handleCancelPreview,
    handleConfirmPreview,
  };
}
