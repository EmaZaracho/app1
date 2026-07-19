import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  addMovement,
  getBudgetAlerts,
  getCurrentMonthTotals,
  getMovements,
  getTotals,
  restoreMovement,
  deleteMovement,
  type BudgetAlert,
  type PeriodTotals,
} from '../db/database';
import { getApiKey, getSelectedProvider } from '../services/apiKey';
import { parseMovement, AIProviderError } from '../services/ai';
import { formatCurrency, formatSignedCurrency } from '../utils/format';
import { CATEGORY_ICON, iconForCategory, colorForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { MovementRowSkeleton } from '../components/Skeleton';
import {
  categoriesForType,
  AI_PROVIDERS,
  type AIProvider,
  type Category,
  type Movement,
  type MovementType,
  type ParsedMovement,
  type RootStackParamList,
} from '../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const UNDO_TIMEOUT_MS = 5000;
const EMPTY_TOTALS: PeriodTotals = { income: 0, expense: 0, balance: 0 };
const SKELETON_ROWS = 6;

function providerLabel(id: AIProvider): string {
  return AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

export default function HomeScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [totals, setTotals] = useState<PeriodTotals>(EMPTY_TOTALS);
  const [monthTotals, setMonthTotals] = useState<PeriodTotals>(EMPTY_TOTALS);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [activeProvider, setActiveProvider] = useState<AIProvider>('deepseek');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MovementType | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | null>(null);
  const [undoMovement, setUndoMovement] = useState<Movement | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  const [pending, setPending] = useState<{ parsed: ParsedMovement; rawText: string } | null>(null);
  const [pendingAmountText, setPendingAmountText] = useState('');

  const load = useCallback(async () => {
    const provider = await getSelectedProvider();
    const [list, allTimeTotals, currentMonthTotals, apiKey, alerts] = await Promise.all([
      getMovements(db),
      getTotals(db),
      getCurrentMonthTotals(db),
      getApiKey(provider),
      getBudgetAlerts(db),
    ]);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMovements(list);
    setTotals(allTimeTotals);
    setMonthTotals(currentMonthTotals);
    setActiveProvider(provider);
    setHasApiKey(!!apiKey);
    setBudgetAlerts(alerts);
    setInitialLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const showUndoBanner = useCallback((movement: Movement) => {
    setUndoMovement(movement);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoMovement(null), UNDO_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const deleted = route.params?.deletedMovement;
    if (!deleted) return;
    navigation.setParams({ deletedMovement: undefined });
    showUndoBanner(deleted);
  }, [route.params?.deletedMovement, navigation, showUndoBanner]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setAndroidKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  async function handleUndo() {
    if (!undoMovement) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const toRestore = undoMovement;
    setUndoMovement(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await restoreMovement(db, toRestore);
    await load();
  }

  async function handleSwipeDelete(movement: Movement) {
    swipeableRefs.current.get(movement.id)?.close();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await deleteMovement(db, movement.id);
    showUndoBanner(movement);
    await load();
  }

  const filterCategoryOptions = useMemo(() => {
    if (filterType) return categoriesForType(filterType);
    const seen = new Set<string>();
    const merged: Category[] = [];
    for (const cat of [...categoriesForType('gasto'), ...categoriesForType('ingreso')]) {
      if (!seen.has(cat)) {
        seen.add(cat);
        merged.push(cat);
      }
    }
    return merged;
  }, [filterType]);

  function handleSelectFilterType(type: MovementType | null) {
    setFilterType(type);
    if (type && filterCategory && !categoriesForType(type).includes(filterCategory)) {
      setFilterCategory(null);
    }
  }

  const filteredMovements = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return movements.filter((item) => {
      if (filterType && item.type !== filterType) return false;
      if (filterCategory && item.category !== filterCategory) return false;
      if (!query) return true;
      return (
        item.description.toLowerCase().includes(query) ||
        item.rawText.toLowerCase().includes(query)
      );
    });
  }, [movements, searchQuery, filterType, filterCategory]);

  const isFiltering = searchQuery.trim().length > 0 || filterType !== null || filterCategory !== null;

  async function handleParse() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);
    try {
      const provider = await getSelectedProvider();
      const apiKey = await getApiKey(provider);
      if (!apiKey) {
        setError(`Configurá tu API key de ${providerLabel(provider)} antes de agregar movimientos.`);
        setHasApiKey(false);
        setActiveProvider(provider);
        return;
      }
      const parsed = await parseMovement(trimmed, provider, apiKey);
      setPending({ parsed, rawText: trimmed });
      setPendingAmountText(String(parsed.amount));
      setText('');
    } catch (err) {
      setError(err instanceof AIProviderError ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPending() {
    if (!pending) return;
    const amount = Number(pendingAmountText.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresá un monto válido mayor a 0.');
      return;
    }
    const finalParsed: ParsedMovement = { ...pending.parsed, amount };
    await addMovement(db, finalParsed, pending.rawText);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPending(null);
    setPendingAmountText('');
    await load();
  }

  function handleCancelPending() {
    if (!pending) return;
    setText(pending.rawText);
    setPending(null);
    setPendingAmountText('');
  }

  function handleSelectPendingType(nextType: MovementType) {
    if (!pending) return;
    const nextCategory = categoriesForType(nextType).includes(pending.parsed.category)
      ? pending.parsed.category
      : categoriesForType(nextType)[0];
    setPending({ ...pending, parsed: { ...pending.parsed, type: nextType, category: nextCategory } });
  }

  function handleSelectPendingCategory(category: Category) {
    if (!pending) return;
    setPending({ ...pending, parsed: { ...pending.parsed, category } });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.totalLabel}>Balance total</Text>
        <Text style={[styles.totalValue, totals.balance < 0 && styles.negativeValue]}>
          {formatCurrency(totals.balance)}
        </Text>
        <Text style={styles.breakdownText}>
          Ingresos {formatCurrency(totals.income)} · Gastos {formatCurrency(totals.expense)}
        </Text>
        <Text style={styles.monthTotal}>Balance de este mes: {formatCurrency(monthTotals.balance)}</Text>
        <View style={styles.headerButtons}>
          <Pressable onPress={() => navigation.navigate('Summary')} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Resumen</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Budgets')} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Presupuestos</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Configuración</Text>
          </Pressable>
        </View>
      </View>

      {!initialLoading && !hasApiKey ? (
        <Pressable style={styles.apiKeyBanner} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.apiKeyBannerText}>
            Configurá tu API key de {providerLabel(activeProvider)} para poder agregar movimientos.
            Tocá acá para ir a Configuración.
          </Text>
        </Pressable>
      ) : null}

      {!initialLoading && budgetAlerts.length > 0 ? (
        <Pressable style={styles.budgetAlertBanner} onPress={() => navigation.navigate('Budgets')}>
          <Text style={styles.budgetAlertText}>
            Superaste el presupuesto de {budgetAlerts.map((a) => a.category).join(', ')} este mes.
            Tocá acá para revisarlo.
          </Text>
        </Pressable>
      ) : null}

      {!initialLoading && movements.length > 0 ? (
        <View style={styles.filterSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar movimientos..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          <View style={styles.typeFilterRow}>
            {(
              [
                { label: 'Todos', value: null },
                { label: 'Gastos', value: 'gasto' as MovementType },
                { label: 'Ingresos', value: 'ingreso' as MovementType },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.label}
                style={[styles.typeChip, filterType === opt.value && styles.typeChipSelected]}
                onPress={() => handleSelectFilterType(opt.value)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    filterType === opt.value && styles.typeChipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilterRow}
          >
            <Pressable
              style={[styles.categoryChip, filterCategory === null && styles.categoryChipSelected]}
              onPress={() => setFilterCategory(null)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  filterCategory === null && styles.categoryChipTextSelected,
                ]}
              >
                Todas
              </Text>
            </Pressable>
            {filterCategoryOptions.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.categoryChip, filterCategory === cat && styles.categoryChipSelected]}
                onPress={() => setFilterCategory(filterCategory === cat ? null : cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    filterCategory === cat && styles.categoryChipTextSelected,
                  ]}
                >
                  {CATEGORY_ICON[cat]} {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {initialLoading ? (
        <View>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <MovementRowSkeleton key={i} />
          ))}
        </View>
      ) : (
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        data={filteredMovements}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Swipeable
            ref={(ref) => {
              if (ref) swipeableRefs.current.set(item.id, ref);
              else swipeableRefs.current.delete(item.id);
            }}
            renderRightActions={() => (
              <Pressable style={styles.deleteAction} onPress={() => handleSwipeDelete(item)}>
                <Text style={styles.deleteActionText}>Eliminar</Text>
              </Pressable>
            )}
          >
            <Pressable
              style={styles.movementRow}
              onPress={() => navigation.navigate('MovementDetail', { movementId: item.id })}
            >
              <Text style={styles.movementIcon}>{iconForCategory(item.category)}</Text>
              <View style={styles.flex}>
                <Text style={styles.movementDescription}>{item.description}</Text>
                <View style={styles.movementMetaRow}>
                  <View
                    style={[
                      styles.categoryDot,
                      { backgroundColor: colorForCategory(item.category, theme.scheme) },
                    ]}
                  />
                  <Text style={styles.movementCategory}>{item.category}</Text>
                  <Text style={styles.movementDate}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <Text style={[styles.movementAmount, item.type === 'ingreso' && styles.incomeAmount]}>
                {formatSignedCurrency(item.amount, item.type)}
              </Text>
            </Pressable>
          </Swipeable>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isFiltering
              ? 'No se encontraron movimientos que coincidan con el filtro.'
              : 'Todavía no registraste movimientos. Probá escribir algo como "gasté 15 dólares en un café" o "cobré el sueldo".'}
          </Text>
        }
      />
      )}

      {undoMovement ? (
        <View style={styles.undoBanner}>
          <Text style={styles.undoText}>Movimiento eliminado.</Text>
          <Pressable onPress={handleUndo}>
            <Text style={styles.undoButtonText}>Deshacer</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {pending ? (
        <View style={styles.previewCard}>
          <View style={styles.typeRow}>
            {(['gasto', 'ingreso'] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.typeChip, pending.parsed.type === t && styles.typeChipSelected]}
                onPress={() => handleSelectPendingType(t)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    pending.parsed.type === t && styles.typeChipTextSelected,
                  ]}
                >
                  {t === 'gasto' ? 'Gasto' : 'Ingreso'}
                </Text>
              </Pressable>
            ))}
            <TextInput
              style={styles.previewAmountInput}
              value={pendingAmountText}
              onChangeText={setPendingAmountText}
              keyboardType="decimal-pad"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilterRow}
          >
            {categoriesForType(pending.parsed.type).map((cat) => (
              <Pressable
                key={cat}
                style={[
                  styles.categoryChip,
                  pending.parsed.category === cat && styles.categoryChipSelected,
                ]}
                onPress={() => handleSelectPendingCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    pending.parsed.category === cat && styles.categoryChipTextSelected,
                  ]}
                >
                  {CATEGORY_ICON[cat]} {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.previewDescription} numberOfLines={1}>
            {pending.parsed.description}
          </Text>
          <View style={styles.previewActions}>
            <Pressable style={styles.previewCancelButton} onPress={handleCancelPending}>
              <Text style={styles.previewCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.previewConfirmButton} onPress={handleConfirmPending}>
              <Text style={styles.previewConfirmText}>Confirmar</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ej: pagué 20 de nafta / cobré el sueldo"
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleParse}
            editable={!loading}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.addButton, loading && styles.addButtonDisabled]}
            onPress={handleParse}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.primaryText} />
            ) : (
              <Text style={styles.addButtonText}>Agregar</Text>
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    header: {
      padding: 20,
      paddingTop: 12,
      backgroundColor: theme.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    totalLabel: { fontSize: 14, color: theme.textSecondary },
    totalValue: { fontSize: 34, fontWeight: '700', marginTop: 4, color: theme.text },
    negativeValue: { color: theme.danger },
    breakdownText: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
    monthTotal: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
    headerButtons: { flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap' },
    apiKeyBanner: {
      backgroundColor: theme.warningBg,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    apiKeyBannerText: { color: theme.warningText, fontSize: 13 },
    budgetAlertBanner: {
      backgroundColor: theme.dangerBg,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    budgetAlertText: { color: theme.dangerText, fontSize: 13 },
    filterSection: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: theme.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 14,
      marginBottom: 10,
    },
    typeFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    typeChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    typeChipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.chipSelectedBg },
    typeChipText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    typeChipTextSelected: { color: theme.chipSelectedText },
    categoryFilterRow: { gap: 8, paddingBottom: 12 },
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
    undoBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.undoBg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 10,
    },
    undoText: { color: theme.undoText, fontSize: 14 },
    undoButtonText: { color: theme.undoAction, fontWeight: '700', fontSize: 14 },
    linkButton: { paddingVertical: 4 },
    linkButtonText: { color: theme.primary, fontWeight: '600' },
    listContent: { padding: 16, flexGrow: 1 },
    deleteAction: {
      backgroundColor: theme.danger,
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingHorizontal: 20,
      marginBottom: 0,
    },
    deleteActionText: { color: '#fff', fontWeight: '700' },
    movementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      backgroundColor: theme.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    movementIcon: { fontSize: 22 },
    movementDescription: { fontSize: 16, fontWeight: '500', color: theme.text },
    movementMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    categoryDot: { width: 7, height: 7, borderRadius: 4 },
    movementCategory: { fontSize: 12, color: theme.textSecondary },
    movementDate: { fontSize: 12, color: theme.textMuted, marginLeft: 4 },
    movementAmount: { fontSize: 16, fontWeight: '700', color: theme.danger },
    incomeAmount: { color: theme.success },
    emptyText: { textAlign: 'center', color: theme.textMuted, marginTop: 40, paddingHorizontal: 20 },
    errorText: { color: theme.danger, paddingHorizontal: 16, paddingBottom: 4 },
    inputRow: {
      flexDirection: 'row',
      padding: 16,
      gap: 8,
      backgroundColor: theme.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
    },
    addButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingHorizontal: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addButtonDisabled: { opacity: 0.6 },
    addButtonText: { color: theme.primaryText, fontWeight: '700' },
    previewCard: {
      padding: 16,
      backgroundColor: theme.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    typeRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
    previewAmountInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 16,
      textAlign: 'right',
      fontWeight: '700',
    },
    previewDescription: { fontSize: 13, color: theme.textSecondary, fontStyle: 'italic', marginTop: 4 },
    previewActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    previewCancelButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    previewCancelText: { color: theme.textSecondary, fontWeight: '600' },
    previewConfirmButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 10,
      backgroundColor: theme.primary,
    },
    previewConfirmText: { color: theme.primaryText, fontWeight: '700' },
  });
}
