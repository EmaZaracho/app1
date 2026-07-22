import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { deleteMovement, getMovementById, updateMovement } from '../db/movementsRepo';
import { getFundById, getFundsWithBalances } from '../db/fundsRepo';
import { unlinkOccurrenceForMovement } from '../recurring/recurringPayment';
import { useDb } from '../db/useDb';
import { FundSelector, type SelectableFund } from '../components/FundSelector';
import { iconForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import {
  categoriesForType,
  type Category,
  type Movement,
  type NewMovement,
  type RootStackParamList,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'MovementDetail'>;

// La UI de edición trabaja con estos tipos; los ajustes se editan aparte.
type EditableType = 'gasto' | 'ingreso' | 'transferencia';

export default function MovementDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { movementId } = route.params;
  const db = useDb();

  const [movement, setMovement] = useState<Movement | null>(null);
  const [type, setType] = useState<EditableType>('gasto');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<Category | null>('Otros');
  const [description, setDescription] = useState('');
  const [sourceFundId, setSourceFundId] = useState<number | null>(null);
  const [destinationFundId, setDestinationFundId] = useState<number | null>(null);
  const [funds, setFunds] = useState<SelectableFund[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leavingRef = useRef(false);

  const isAdjustment = movement?.type === 'ajuste';

  useEffect(() => {
    (async () => {
      const found = await getMovementById(db, movementId);
      if (!found) return;
      setMovement(found);
      setAmountText(String(found.amount));
      setDescription(found.description);
      setCategory(found.category);
      setSourceFundId(found.sourceFundId);
      setDestinationFundId(found.destinationFundId);
      if (found.type !== 'ajuste') setType(found.type);

      // Fondos seleccionables: activos + los referenciados por el movimiento (aunque estén archivados).
      const active = await getFundsWithBalances(db, false);
      const options: SelectableFund[] = active.map((f) => ({
        id: f.id,
        name: f.name,
        icon: f.icon,
        color: f.color,
      }));
      const ids = new Set(options.map((o) => o.id));
      for (const refId of [found.sourceFundId, found.destinationFundId]) {
        if (refId != null && !ids.has(refId)) {
          const fund = await getFundById(db, refId);
          if (fund) options.push({ id: fund.id, name: fund.name, icon: fund.icon, color: fund.color });
        }
      }
      setFunds(options);
    })();
  }, [db, movementId]);

  const dirty =
    !!movement &&
    (amountText !== String(movement.amount) ||
      description !== movement.description ||
      category !== movement.category ||
      sourceFundId !== movement.sourceFundId ||
      destinationFundId !== movement.destinationFundId ||
      (movement.type !== 'ajuste' && type !== movement.type));

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current || !dirty) return;
      e.preventDefault();
      Alert.alert(
        'Descartar cambios',
        'Tenés cambios sin guardar en este movimiento. ¿Querés descartarlos?',
        [
          { text: 'Seguir editando', style: 'cancel' },
          { text: 'Descartar', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
  }, [navigation, dirty]);

  function handleSelectType(nextType: EditableType) {
    setType(nextType);
    if (nextType === 'transferencia') {
      setCategory(null);
    } else if (!category || !categoriesForType(nextType).includes(category)) {
      setCategory(categoriesForType(nextType)[0]);
    }
  }

  function buildMovement(): NewMovement | { error: string } {
    const amount = Number(amountText.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Ingresá un monto válido mayor a 0.' };
    if (!description.trim()) return { error: 'Ingresá una descripción.' };

    if (isAdjustment && movement) {
      // Se preserva la dirección del ajuste (origen o destino).
      return {
        type: 'ajuste',
        amount,
        category: null,
        description: description.trim(),
        rawText: movement.rawText,
        sourceFundId: movement.sourceFundId != null ? sourceFundId : null,
        destinationFundId: movement.destinationFundId != null ? destinationFundId : null,
      };
    }

    if (type === 'gasto') {
      if (sourceFundId == null) return { error: 'Elegí el fondo de origen.' };
      if (!category) return { error: 'Elegí una categoría.' };
      return {
        type: 'gasto',
        amount,
        category,
        description: description.trim(),
        rawText: movement?.rawText ?? description.trim(),
        sourceFundId,
        destinationFundId: null,
      };
    }
    if (type === 'ingreso') {
      if (destinationFundId == null) return { error: 'Elegí el fondo de destino.' };
      if (!category) return { error: 'Elegí una categoría.' };
      return {
        type: 'ingreso',
        amount,
        category,
        description: description.trim(),
        rawText: movement?.rawText ?? description.trim(),
        sourceFundId: null,
        destinationFundId,
      };
    }
    // transferencia
    if (sourceFundId == null || destinationFundId == null) {
      return { error: 'Elegí el fondo de origen y el de destino.' };
    }
    if (sourceFundId === destinationFundId) {
      return { error: 'El origen y el destino deben ser distintos.' };
    }
    return {
      type: 'transferencia',
      amount,
      category: null,
      description: description.trim(),
      rawText: movement?.rawText ?? description.trim(),
      sourceFundId,
      destinationFundId,
    };
  }

  async function handleSave() {
    const built = buildMovement();
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateMovement(db, movementId, built);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      leavingRef.current = true;
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert('Eliminar movimiento', '¿Seguro que querés eliminarlo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const occId = await unlinkOccurrenceForMovement(db, movementId);
          await deleteMovement(db, movementId);
          leavingRef.current = true;
          navigation.navigate('MainTabs', {
            screen: 'HomeTab',
            params: {
              deletedMovement: movement ?? undefined,
              deletedOccurrenceId: occId ?? undefined,
            },
          });
        },
      },
    ]);
  }

  if (!movement) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const showCategory = !isAdjustment && type !== 'transferencia';
  const showSource = isAdjustment ? movement.sourceFundId != null : type !== 'ingreso';
  const showDestination = isAdjustment ? movement.destinationFundId != null : type !== 'gasto';

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      {isAdjustment ? (
        <View style={styles.adjustBadge}>
          <Text style={styles.adjustBadgeText}>⚖️ Ajuste de saldo</Text>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.typeRow}>
            {(['gasto', 'ingreso', 'transferencia'] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.typeChip, type === t && styles.typeChipSelected]}
                onPress={() => handleSelectType(t)}
              >
                <Text style={[styles.typeChipText, type === t && styles.typeChipTextSelected]}>
                  {t === 'gasto' ? 'Gasto' : t === 'ingreso' ? 'Ingreso' : 'Transfer.'}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>Monto</Text>
      <TextInput
        style={styles.input}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
      />

      {showCategory ? (
        <>
          <Text style={styles.label}>Categoría</Text>
          <View style={styles.categoryRow}>
            {categoriesForType(type as 'gasto' | 'ingreso').map((cat) => (
              <Pressable
                key={cat}
                style={[styles.categoryChip, cat === category && styles.categoryChipSelected]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[styles.categoryChipText, cat === category && styles.categoryChipTextSelected]}
                >
                  {iconForCategory(cat)} {cat}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {showSource ? (
        <FundSelector
          label={type === 'transferencia' ? 'Fondo de origen' : isAdjustment ? 'Fondo' : 'Fondo de origen'}
          funds={funds}
          selectedId={sourceFundId}
          onSelect={setSourceFundId}
          excludeId={type === 'transferencia' ? destinationFundId : null}
          required
        />
      ) : null}

      {showDestination ? (
        <FundSelector
          label={type === 'transferencia' ? 'Fondo de destino' : isAdjustment ? 'Fondo' : 'Fondo de destino'}
          funds={funds}
          selectedId={destinationFundId}
          onSelect={setDestinationFundId}
          excludeId={type === 'transferencia' ? sourceFundId : null}
          required
        />
      ) : null}

      <Text style={styles.label}>Descripción</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} />

      <Text style={styles.rawTextHint}>Texto original: "{movement.rawText}"</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={theme.primaryText} />
        ) : (
          <Text style={styles.saveButtonText}>Guardar cambios</Text>
        )}
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={saving}>
        <Text style={styles.deleteButtonText}>Eliminar movimiento</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
    container: { padding: 20, paddingBottom: 48 },
    adjustBadge: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignSelf: 'flex-start',
    },
    adjustBadgeText: { color: theme.textSecondary, fontWeight: '700' },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16, color: theme.text },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
    },
    typeRow: { flexDirection: 'row', gap: 8 },
    typeChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    typeChipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.chipSelectedBg },
    typeChipText: { fontSize: 14, color: theme.text, fontWeight: '600' },
    typeChipTextSelected: { color: theme.chipSelectedText },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    categoryChipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    categoryChipText: { fontSize: 13, color: theme.text },
    categoryChipTextSelected: { color: theme.primaryText, fontWeight: '600' },
    rawTextHint: { fontSize: 12, color: theme.textMuted, marginTop: 16, fontStyle: 'italic' },
    errorText: { color: theme.danger, marginTop: 16 },
    saveButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 24,
    },
    buttonDisabled: { opacity: 0.6 },
    saveButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 16 },
    deleteButton: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    deleteButtonText: { color: theme.danger, fontWeight: '600' },
  });
}
