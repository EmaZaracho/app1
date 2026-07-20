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
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  addMovement,
  deleteMovement,
  getBudgetAlerts,
  getFunds,
  getFundsWithBalances,
  getMovements,
  getMovementsForFund,
  getFundStats,
  getTotalStats,
  restoreMovement,
  type BudgetAlert,
} from '../db/database';
import type { SlideStats } from '../db/balances';
import { useDb } from '../db/useDb';
import { getApiKey, getSelectedProvider } from '../services/apiKey';
import { parseMovement, resolveAIMovement, AIProviderError } from '../services/ai';
import { getFundMatchTargets } from '../db/fundsRepo';
import { computeFundSelection } from '../domain/movementRules';
import { describeMovement } from '../domain/movementDisplay';
import { formatCurrency, formatSignedCurrency } from '../utils/format';
import { CATEGORY_ICON, iconForCategory, colorForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { MovementRowSkeleton } from '../components/Skeleton';
import { FundCarousel, type CarouselSlide } from '../components/FundCarousel';
import { FundSelector, type SelectableFund } from '../components/FundSelector';
import {
  categoriesForType,
  AI_PROVIDERS,
  type AIMovementType,
  type AIProvider,
  type Category,
  type Fund,
  type FundWithBalance,
  type Movement,
  type MovementType,
  type NewMovement,
  type RootStackParamList,
} from '../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const UNDO_TIMEOUT_MS = 5000;
const SKELETON_ROWS = 5;

function providerLabel(id: AIProvider): string {
  return AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

function buildNewMovement(
  type: AIMovementType,
  amount: number,
  category: Category | null,
  description: string,
  rawText: string,
  sourceFundId: number | null,
  destinationFundId: number | null
): NewMovement {
  if (type === 'gasto') {
    return { type: 'gasto', amount, category: category ?? 'Otros', description, rawText, sourceFundId, destinationFundId: null };
  }
  if (type === 'ingreso') {
    return { type: 'ingreso', amount, category: category ?? 'Otros', description, rawText, sourceFundId: null, destinationFundId };
  }
  return { type: 'transferencia', amount, category: null, description, rawText, sourceFundId, destinationFundId };
}

interface Preview {
  type: AIMovementType;
  amount: string;
  category: Category | null;
  description: string;
  sourceFundId: number | null;
  destinationFundId: number | null;
  rawText: string;
}

export default function HomeScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();

  const [text, setText] = useState('');
  const [funds, setFunds] = useState<FundWithBalance[]>([]);
  const [allFunds, setAllFunds] = useState<Fund[]>([]);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [activeProvider, setActiveProvider] = useState<AIProvider>('deepseek');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MovementType | null>(null);
  const [undoMovement, setUndoMovement] = useState<Movement | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());
  const [preview, setPreview] = useState<Preview | null>(null);

  const fundNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of allFunds) map.set(f.id, f.name);
    return map;
  }, [allFunds]);

  const defaultFundId = useMemo(() => funds.find((f) => f.isDefault)?.id ?? null, [funds]);

  const activeSlide = slides[activeIndex];
  const context = useMemo(
    () =>
      activeSlide && activeSlide.kind === 'fund'
        ? ({ kind: 'fund', fundId: activeSlide.fund.id } as const)
        : ({ kind: 'total' } as const),
    [activeSlide]
  );

  const buildSlides = useCallback(
    async (activeFunds: FundWithBalance[]): Promise<CarouselSlide[]> => {
      const totalStats = await getTotalStats(db);
      const fundStats = await Promise.all(activeFunds.map((f) => getFundStats(db, f.id)));
      const fundSlides: CarouselSlide[] = activeFunds.map((fund, i) => ({
        kind: 'fund',
        fund,
        stats: fundStats[i],
      }));
      return [{ kind: 'total', stats: totalStats }, ...fundSlides];
    },
    [db]
  );

  const loadMovementsForSlide = useCallback(
    async (slide: CarouselSlide | undefined) => {
      if (!slide) return;
      const list =
        slide.kind === 'fund' ? await getMovementsForFund(db, slide.fund.id) : await getMovements(db);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMovements(list);
    },
    [db]
  );

  const load = useCallback(async () => {
    const provider = await getSelectedProvider();
    const [activeFunds, everyFund, apiKey, alerts] = await Promise.all([
      getFundsWithBalances(db, false),
      getFunds(db, true),
      getApiKey(provider),
      getBudgetAlerts(db),
    ]);
    const nextSlides = await buildSlides(activeFunds);
    setFunds(activeFunds);
    setAllFunds(everyFund);
    setSlides(nextSlides);
    setActiveProvider(provider);
    setHasApiKey(!!apiKey);
    setBudgetAlerts(alerts);
    const boundedIndex = Math.min(activeIndex, nextSlides.length - 1);
    setActiveIndex(boundedIndex);
    await loadMovementsForSlide(nextSlides[boundedIndex]);
    setInitialLoading(false);
  }, [db, buildSlides, loadMovementsForSlide, activeIndex]);

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

  function handleIndexChange(index: number) {
    setActiveIndex(index);
    loadMovementsForSlide(slides[index]);
  }

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

  const selectableFunds: SelectableFund[] = useMemo(
    () => funds.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })),
    [funds]
  );

  const filteredMovements = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return movements.filter((item) => {
      if (filterType && item.type !== filterType) return false;
      if (!query) return true;
      return (
        item.description.toLowerCase().includes(query) ||
        item.rawText.toLowerCase().includes(query) ||
        (item.category ?? '').toLowerCase().includes(query)
      );
    });
  }, [movements, searchQuery, filterType]);

  const isFiltering = searchQuery.trim().length > 0 || filterType !== null;

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

      // Si la entrada es clara y no ambigua, se confirma automáticamente.
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
        await load();
        return;
      }

      // Entrada ambigua o incompleta: se muestra la vista previa para completar.
      setPreview({
        type: resolved.type,
        amount: String(resolved.amount),
        category: resolved.category,
        description: resolved.description,
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
  }

  const previewSelection = useMemo(() => {
    if (!preview) return null;
    return computeFundSelection({
      type: preview.type,
      resolvedSourceId: preview.sourceFundId,
      resolvedDestId: preview.destinationFundId,
      activeFunds: funds.map((f) => ({ id: f.id, isDefault: f.isDefault })),
      defaultFundId,
    });
  }, [preview, funds, defaultFundId]);

  const previewAmountValue = preview ? Number(preview.amount.replace(',', '.')) : 0;
  const previewAmountValid = Number.isFinite(previewAmountValue) && previewAmountValue > 0;

  const negativeWarning = useMemo(() => {
    if (!preview || !previewAmountValid) return null;
    const sourceId = preview.sourceFundId;
    if (sourceId == null) return null;
    const fund = funds.find((f) => f.id === sourceId);
    if (!fund) return null;
    if (fund.balance - previewAmountValue < 0) {
      return `${fund.name} quedará en negativo (${formatCurrency(fund.balance - previewAmountValue)}).`;
    }
    return null;
  }, [preview, funds, previewAmountValid, previewAmountValue]);

  function updatePreview(patch: Partial<Preview>) {
    setPreview((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function handlePreviewType(nextType: AIMovementType) {
    if (!preview) return;
    const category =
      nextType === 'transferencia'
        ? null
        : preview.category && categoriesForType(nextType).includes(preview.category)
          ? preview.category
          : categoriesForType(nextType)[0];
    // Reasignar fondos según el nuevo tipo (auto-asignar si hay un solo fondo).
    const selection = computeFundSelection({
      type: nextType,
      resolvedSourceId: nextType === 'ingreso' ? null : preview.sourceFundId,
      resolvedDestId: nextType === 'gasto' ? null : preview.destinationFundId,
      activeFunds: funds.map((f) => ({ id: f.id, isDefault: f.isDefault })),
      defaultFundId,
    });
    updatePreview({
      type: nextType,
      category,
      sourceFundId: selection.sourceFundId,
      destinationFundId: selection.destinationFundId,
    });
  }

  function handleCancelPreview() {
    if (!preview) return;
    setText(preview.rawText);
    setPreview(null);
  }

  async function handleConfirmPreview() {
    if (!preview || !previewSelection) return;
    if (!previewAmountValid) {
      setError('Ingresá un monto válido mayor a 0.');
      return;
    }
    if (!previewSelection.canConfirm) return;

    const movement = buildNewMovement(
      preview.type,
      previewAmountValue,
      preview.category,
      preview.description.trim() || preview.rawText,
      preview.rawText,
      preview.sourceFundId,
      preview.destinationFundId
    );

    try {
      await addMovement(db, movement);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreview(null);
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
    }
  }

  const showCategoryChips = preview && preview.type !== 'transferencia';
  const showSourceSelector = preview && (preview.type === 'gasto' || preview.type === 'transferencia');
  const showDestSelector = preview && (preview.type === 'ingreso' || preview.type === 'transferencia');

  return (
    <KeyboardAvoidingView
      style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {!initialLoading && slides.length > 0 ? (
        <FundCarousel
          slides={slides}
          activeIndex={Math.min(activeIndex, slides.length - 1)}
          onIndexChange={handleIndexChange}
          onAddFund={() => navigation.navigate('FundEditor', undefined)}
        />
      ) : null}

      {!initialLoading ? (
        <View style={styles.quickLinksRow}>
          <Pressable style={styles.quickLink} onPress={() => navigation.navigate('Summary')}>
            <Text style={styles.quickLinkText}>📊 Resumen</Text>
          </Pressable>
          <Pressable style={styles.quickLink} onPress={() => navigation.navigate('Budgets')}>
            <Text style={styles.quickLinkText}>🎯 Presupuestos</Text>
          </Pressable>
          <Pressable style={styles.quickLink} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.quickLinkText}>⚙️ Configuración</Text>
          </Pressable>
        </View>
      ) : null}

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
                { label: 'Transfer.', value: 'transferencia' as MovementType },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.label}
                style={[styles.typeChip, filterType === opt.value && styles.typeChipSelected]}
                onPress={() => setFilterType(opt.value)}
              >
                <Text
                  style={[styles.typeChipText, filterType === opt.value && styles.typeChipTextSelected]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
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
          renderItem={({ item }) => {
            const display = describeMovement(item, context, (id) => fundNameById.get(id) ?? 'Fondo');
            const amountColor =
              display.neutral || display.signedAmount == null
                ? theme.textSecondary
                : display.signedAmount >= 0
                  ? theme.success
                  : theme.danger;
            return (
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
                  <Text style={styles.movementIcon}>
                    {item.type === 'transferencia'
                      ? '🔁'
                      : item.type === 'ajuste'
                        ? '⚖️'
                        : iconForCategory(item.category ?? 'Otros')}
                  </Text>
                  <View style={styles.flex}>
                    <Text style={styles.movementDescription}>{item.description}</Text>
                    <View style={styles.movementMetaRow}>
                      {item.category ? (
                        <View
                          style={[
                            styles.categoryDot,
                            { backgroundColor: colorForCategory(item.category, theme.scheme) },
                          ]}
                        />
                      ) : null}
                      <Text style={styles.movementCategory}>
                        {display.contextNote ?? display.label}
                      </Text>
                      <Text style={styles.movementDate}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.movementAmount, { color: amountColor }]}>
                    {display.signedAmount == null
                      ? formatCurrency(item.amount)
                      : formatSignedCurrency(display.signedAmount)}
                  </Text>
                </Pressable>
              </Swipeable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {isFiltering
                ? 'No se encontraron movimientos que coincidan con el filtro.'
                : context.kind === 'fund'
                  ? 'Este fondo todavía no tiene movimientos.'
                  : 'Todavía no registraste movimientos. Probá escribir algo como "gasté 15 en un café" o "pasé 20000 de efectivo a MP".'}
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

      {preview ? (
        <ScrollView style={styles.previewCard} keyboardShouldPersistTaps="handled">
          <View style={styles.typeRow}>
            {(['gasto', 'ingreso', 'transferencia'] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.typeChip, preview.type === t && styles.typeChipSelected]}
                onPress={() => handlePreviewType(t)}
              >
                <Text style={[styles.typeChipText, preview.type === t && styles.typeChipTextSelected]}>
                  {t === 'gasto' ? 'Gasto' : t === 'ingreso' ? 'Ingreso' : 'Transfer.'}
                </Text>
              </Pressable>
            ))}
            <TextInput
              style={styles.previewAmountInput}
              value={preview.amount}
              onChangeText={(v) => updatePreview({ amount: v })}
              keyboardType="decimal-pad"
            />
          </View>

          {showCategoryChips ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
            >
              {categoriesForType(preview.type as 'gasto' | 'ingreso').map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.categoryChip, preview.category === cat && styles.categoryChipSelected]}
                  onPress={() => updatePreview({ category: cat })}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      preview.category === cat && styles.categoryChipTextSelected,
                    ]}
                  >
                    {CATEGORY_ICON[cat]} {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {previewSelection?.blockingMessage ? (
            <Text style={styles.blockingText}>{previewSelection.blockingMessage}</Text>
          ) : null}

          {showSourceSelector ? (
            <FundSelector
              label={preview.type === 'transferencia' ? '¿Desde qué fondo?' : '¿Desde qué fondo se pagó?'}
              funds={selectableFunds}
              selectedId={preview.sourceFundId}
              onSelect={(id) => updatePreview({ sourceFundId: id })}
              excludeId={preview.type === 'transferencia' ? preview.destinationFundId : null}
              required
            />
          ) : null}

          {showDestSelector ? (
            <FundSelector
              label={preview.type === 'transferencia' ? '¿Hacia qué fondo?' : '¿A qué fondo ingresó?'}
              funds={selectableFunds}
              selectedId={preview.destinationFundId}
              onSelect={(id) => updatePreview({ destinationFundId: id })}
              excludeId={preview.type === 'transferencia' ? preview.sourceFundId : null}
              required
            />
          ) : null}

          <TextInput
            style={styles.previewDescriptionInput}
            value={preview.description}
            onChangeText={(v) => updatePreview({ description: v })}
            placeholder="Descripción"
            placeholderTextColor={theme.textMuted}
          />

          {negativeWarning ? <Text style={styles.warningText}>⚠️ {negativeWarning}</Text> : null}

          <View style={styles.previewActions}>
            <Pressable style={styles.previewCancelButton} onPress={handleCancelPreview}>
              <Text style={styles.previewCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[
                styles.previewConfirmButton,
                (!previewSelection?.canConfirm || !previewAmountValid) && styles.buttonDisabled,
              ]}
              onPress={handleConfirmPreview}
              disabled={!previewSelection?.canConfirm || !previewAmountValid}
            >
              <Text style={styles.previewConfirmText}>Confirmar</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder='Ej: "pagué 20 de nafta con MP"'
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleParse}
            editable={!loading}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.addButton, loading && styles.buttonDisabled]}
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
    quickLinksRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    quickLink: { paddingVertical: 4, paddingHorizontal: 6 },
    quickLinkText: { color: theme.primary, fontWeight: '600', fontSize: 13 },
    apiKeyBanner: { backgroundColor: theme.warningBg, paddingHorizontal: 16, paddingVertical: 10 },
    apiKeyBannerText: { color: theme.warningText, fontSize: 13 },
    budgetAlertBanner: { backgroundColor: theme.dangerBg, paddingHorizontal: 16, paddingVertical: 10 },
    budgetAlertText: { color: theme.dangerText, fontSize: 13 },
    filterSection: {
      paddingHorizontal: 16,
      paddingTop: 8,
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
    typeFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
    typeChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    typeChipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.chipSelectedBg },
    typeChipText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    typeChipTextSelected: { color: theme.chipSelectedText },
    listContent: { padding: 16, flexGrow: 1 },
    deleteAction: {
      backgroundColor: theme.danger,
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingHorizontal: 20,
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
    movementAmount: { fontSize: 16, fontWeight: '700' },
    emptyText: { textAlign: 'center', color: theme.textMuted, marginTop: 40, paddingHorizontal: 20 },
    errorText: { color: theme.danger, paddingHorizontal: 16, paddingBottom: 4 },
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
    buttonDisabled: { opacity: 0.5 },
    addButtonText: { color: theme.primaryText, fontWeight: '700' },
    previewCard: {
      maxHeight: 340,
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
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 16,
      textAlign: 'right',
      fontWeight: '700',
    },
    categoryRow: { gap: 8, paddingBottom: 8 },
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
    blockingText: { color: theme.warningText, fontSize: 13, marginTop: 8 },
    warningText: { color: theme.warningText, fontSize: 13, marginTop: 10 },
    previewDescriptionInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      marginTop: 12,
    },
    previewActions: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 8 },
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
