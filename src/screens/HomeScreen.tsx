import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  type BudgetAlert,
  type PeriodTotals,
} from '../db/database';
import { getActiveProvider, getApiKey } from '../services/apiKey';
import { parseMovementWithProvider, MovementParseError } from '../services/movementParser';
import { formatCurrency, formatSignedCurrency } from '../utils/format';
import {
  categoriesForType,
  PROVIDER_LABELS,
  type ApiProvider,
  type Category,
  type Movement,
  type MovementType,
  type RootStackParamList,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const UNDO_TIMEOUT_MS = 5000;
const EMPTY_TOTALS: PeriodTotals = { income: 0, expense: 0, balance: 0 };

export default function HomeScreen({ navigation, route }: Props) {
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [totals, setTotals] = useState<PeriodTotals>(EMPTY_TOTALS);
  const [monthTotals, setMonthTotals] = useState<PeriodTotals>(EMPTY_TOTALS);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [activeProvider, setActiveProviderState] = useState<ApiProvider>('deepseek');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MovementType | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | null>(null);
  const [undoMovement, setUndoMovement] = useState<Movement | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [list, allTimeTotals, currentMonthTotals, provider, alerts] = await Promise.all([
      getMovements(db),
      getTotals(db),
      getCurrentMonthTotals(db),
      getActiveProvider(),
      getBudgetAlerts(db),
    ]);
    const apiKey = await getApiKey(provider);
    setMovements(list);
    setTotals(allTimeTotals);
    setMonthTotals(currentMonthTotals);
    setActiveProviderState(provider);
    setHasApiKey(!!apiKey);
    setBudgetAlerts(alerts);
    setInitialLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const deleted = route.params?.deletedMovement;
    if (!deleted) return;
    navigation.setParams({ deletedMovement: undefined });
    setUndoMovement(deleted);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoMovement(null), UNDO_TIMEOUT_MS);
  }, [route.params?.deletedMovement, navigation]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  async function handleUndo() {
    if (!undoMovement) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const toRestore = undoMovement;
    setUndoMovement(null);
    await restoreMovement(db, toRestore);
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

  async function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);
    try {
      const provider = await getActiveProvider();
      const apiKey = await getApiKey(provider);
      if (!apiKey) {
        setError(`Configurá tu API key de ${PROVIDER_LABELS[provider]} antes de agregar movimientos.`);
        setHasApiKey(false);
        return;
      }
      const parsed = await parseMovementWithProvider(trimmed, provider, apiKey);
      await addMovement(db, parsed, trimmed);
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof MovementParseError ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            Configurá tu API key de {PROVIDER_LABELS[activeProvider]} para poder agregar
            movimientos. Tocá acá para ir a Configuración.
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
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {initialLoading ? (
        <View style={styles.initialLoadingContainer}>
          <ActivityIndicator />
        </View>
      ) : (
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        data={filteredMovements}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.movementRow}
            onPress={() => navigation.navigate('MovementDetail', { movementId: item.id })}
          >
            <View style={styles.flex}>
              <Text style={styles.movementDescription}>{item.description}</Text>
              <View style={styles.movementMetaRow}>
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

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ej: pagué 20 de nafta / cobré el sueldo"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleAdd}
          editable={!loading}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.addButton, loading && styles.addButtonDisabled]}
          onPress={handleAdd}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>Agregar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    padding: 20,
    paddingTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  totalLabel: { fontSize: 14, color: '#666' },
  totalValue: { fontSize: 34, fontWeight: '700', marginTop: 4 },
  negativeValue: { color: '#dc2626' },
  breakdownText: { fontSize: 13, color: '#666', marginTop: 4 },
  monthTotal: { fontSize: 13, color: '#666', marginTop: 2 },
  headerButtons: { flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap' },
  apiKeyBanner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  apiKeyBannerText: { color: '#92400e', fontSize: 13 },
  budgetAlertBanner: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  budgetAlertText: { color: '#991b1b', fontSize: 13 },
  initialLoadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 10,
  },
  typeFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  typeChipSelected: { backgroundColor: '#111827', borderColor: '#111827' },
  typeChipText: { fontSize: 13, color: '#333', fontWeight: '600' },
  typeChipTextSelected: { color: '#fff' },
  categoryFilterRow: { gap: 8, paddingBottom: 12 },
  categoryChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryChipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  categoryChipText: { fontSize: 13, color: '#333' },
  categoryChipTextSelected: { color: '#fff', fontWeight: '600' },
  undoBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  undoText: { color: '#fff', fontSize: 14 },
  undoButtonText: { color: '#60a5fa', fontWeight: '700', fontSize: 14 },
  linkButton: { paddingVertical: 4 },
  linkButtonText: { color: '#2563eb', fontWeight: '600' },
  listContent: { padding: 16, flexGrow: 1 },
  movementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  movementDescription: { fontSize: 16, fontWeight: '500' },
  movementMetaRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  movementCategory: {
    fontSize: 12,
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  movementDate: { fontSize: 12, color: '#999' },
  movementAmount: { fontSize: 16, fontWeight: '700', color: '#dc2626' },
  incomeAmount: { color: '#16a34a' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, paddingHorizontal: 20 },
  errorText: { color: '#dc2626', paddingHorizontal: 16, paddingBottom: 4 },
  inputRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { color: '#fff', fontWeight: '700' },
});
