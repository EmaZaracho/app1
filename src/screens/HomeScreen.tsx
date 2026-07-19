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
  addExpense,
  getCurrentMonthTotal,
  getExpenses,
  getGrandTotal,
  restoreExpense,
} from '../db/database';
import { getApiKey } from '../services/apiKey';
import { parseExpense, DeepSeekError } from '../services/deepseek';
import { formatCurrency } from '../utils/format';
import { CATEGORIES, type Category, type Expense, type RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const UNDO_TIMEOUT_MS = 5000;

export default function HomeScreen({ navigation, route }: Props) {
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<Category | null>(null);
  const [undoExpense, setUndoExpense] = useState<Expense | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [list, grandTotal, currentMonthTotal, apiKey] = await Promise.all([
      getExpenses(db),
      getGrandTotal(db),
      getCurrentMonthTotal(db),
      getApiKey(),
    ]);
    setExpenses(list);
    setTotal(grandTotal);
    setMonthTotal(currentMonthTotal);
    setHasApiKey(!!apiKey);
    setInitialLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const deleted = route.params?.deletedExpense;
    if (!deleted) return;
    navigation.setParams({ deletedExpense: undefined });
    setUndoExpense(deleted);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoExpense(null), UNDO_TIMEOUT_MS);
  }, [route.params?.deletedExpense, navigation]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  async function handleUndo() {
    if (!undoExpense) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const toRestore = undoExpense;
    setUndoExpense(null);
    await restoreExpense(db, toRestore);
    await load();
  }

  const filteredExpenses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return expenses.filter((item) => {
      if (filterCategory && item.category !== filterCategory) return false;
      if (!query) return true;
      return (
        item.description.toLowerCase().includes(query) ||
        item.rawText.toLowerCase().includes(query)
      );
    });
  }, [expenses, searchQuery, filterCategory]);

  const isFiltering = searchQuery.trim().length > 0 || filterCategory !== null;

  async function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        setError('Configurá tu API key de DeepSeek antes de agregar gastos.');
        setHasApiKey(false);
        return;
      }
      const parsed = await parseExpense(trimmed, apiKey);
      await addExpense(db, parsed, trimmed);
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof DeepSeekError ? err.message : 'Ocurrió un error inesperado.');
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
        <Text style={styles.totalLabel}>Total gastado</Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
        <Text style={styles.monthTotal}>Este mes: {formatCurrency(monthTotal)}</Text>
        <View style={styles.headerButtons}>
          <Pressable onPress={() => navigation.navigate('Summary')} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Resumen</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Configuración</Text>
          </Pressable>
        </View>
      </View>

      {!initialLoading && !hasApiKey ? (
        <Pressable style={styles.apiKeyBanner} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.apiKeyBannerText}>
            Configurá tu API key de DeepSeek para poder agregar gastos. Tocá acá para ir a Configuración.
          </Text>
        </Pressable>
      ) : null}

      {!initialLoading && expenses.length > 0 ? (
        <View style={styles.filterSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar gastos..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
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
            {CATEGORIES.map((cat) => (
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
        data={filteredExpenses}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.expenseRow}
            onPress={() => navigation.navigate('ExpenseDetail', { expenseId: item.id })}
          >
            <View style={styles.flex}>
              <Text style={styles.expenseDescription}>{item.description}</Text>
              <View style={styles.expenseMetaRow}>
                <Text style={styles.expenseCategory}>{item.category}</Text>
                <Text style={styles.expenseDate}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <Text style={styles.expenseAmount}>{formatCurrency(item.amount)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isFiltering
              ? 'No se encontraron gastos que coincidan con el filtro.'
              : 'Todavía no registraste gastos. Probá escribir algo como "gasté 15 dólares en un café".'}
          </Text>
        }
      />
      )}

      {undoExpense ? (
        <View style={styles.undoBanner}>
          <Text style={styles.undoText}>Gasto eliminado.</Text>
          <Pressable onPress={handleUndo}>
            <Text style={styles.undoButtonText}>Deshacer</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ej: pagué 20 de nafta"
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
  monthTotal: { fontSize: 13, color: '#666', marginTop: 4 },
  headerButtons: { flexDirection: 'row', gap: 16, marginTop: 12 },
  apiKeyBanner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  apiKeyBannerText: { color: '#92400e', fontSize: 13 },
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
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  expenseDescription: { fontSize: 16, fontWeight: '500' },
  expenseMetaRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  expenseCategory: {
    fontSize: 12,
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  expenseDate: { fontSize: 12, color: '#999' },
  expenseAmount: { fontSize: 16, fontWeight: '700' },
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
