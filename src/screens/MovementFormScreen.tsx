import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import { addMovement, getFundsWithBalances } from '../db/database';
import { assertFundsStillActive } from '../domain/movementRules';
import { useMovementForm } from '../hooks/useMovementForm';
import { MovementFormFields } from '../components/MovementFormFields';
import type { SelectableFund } from '../components/FundSelector';
import { useTheme, type Theme } from '../theme';
import type { AIMovementType, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'MovementForm'>;

const TITLE: Record<AIMovementType, string> = {
  gasto: 'Registrar gasto',
  ingreso: 'Registrar ingreso',
  transferencia: 'Transferir',
};

export default function MovementFormScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const initialType = route.params?.initialType ?? 'gasto';

  const [funds, setFunds] = useState<SelectableFund[]>([]);
  const [activeFundOptions, setActiveFundOptions] = useState<{ id: number; isDefault: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadFunds = useCallback(async () => {
    const active = await getFundsWithBalances(db, false);
    if (!mountedRef.current) return;
    setFunds(active.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })));
    setActiveFundOptions(active.map((f) => ({ id: f.id, isDefault: f.isDefault })));
    setLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadFunds();
    }, [loadFunds])
  );

  // El registro manual NUNCA auto-asigna el fondo predeterminado cuando hay
  // varios fondos activos: por eso `defaultFundId` no se pasa al hook (a
  // diferencia del flujo de IA). Con un único fondo activo sí se autoasigna,
  // porque no hay otra opción posible.
  const form = useMovementForm({
    initialType,
    activeFunds: activeFundOptions,
  });

  useEffect(() => {
    navigation.setOptions({ title: TITLE[form.type] });
  }, [navigation, form.type]);

  async function handleSubmit() {
    if (saving || !form.canSubmit) return;
    const result = form.buildResult(`[manual] ${form.description.trim()}`);
    if (!result.movement) {
      setError(result.error);
      return;
    }
    const activeIds = new Set(activeFundOptions.map((f) => f.id));
    const fundError = assertFundsStillActive(
      [result.movement.sourceFundId, result.movement.destinationFundId],
      activeIds
    );
    if (fundError) {
      setError(fundError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await addMovement(db, result.movement);
      if (!mountedRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <MovementFormFields form={form} funds={funds} />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.submitButton, (!form.canSubmit || saving) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!form.canSubmit || saving}
        >
          {saving ? <ActivityIndicator color={theme.primaryText} /> : <Text style={styles.submitText}>Guardar</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
    container: { padding: 20, paddingBottom: 48 },
    errorText: { color: theme.danger, fontSize: 13, marginTop: 16 },
    submitButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 24,
    },
    buttonDisabled: { opacity: 0.5 },
    submitText: { color: theme.primaryText, fontWeight: '700', fontSize: 16 },
  });
}
