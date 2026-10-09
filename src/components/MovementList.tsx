import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { describeMovement, type DisplayContext } from '../domain/movementDisplay';
import { groupPurchases, type MovementListEntry } from '../domain/purchaseGroups';
import { formatCurrency, formatSignedCurrency } from '../utils/format';
import { iconForCategory, colorForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { MovementRowSkeleton } from './Skeleton';
import type { Movement } from '../types';

const SKELETON_ROWS = 5;

interface MovementListProps {
  loading: boolean;
  movements: Movement[];
  isFiltering: boolean;
  context: DisplayContext;
  fundNameById: Map<number, string>;
  onPressItem: (movementId: number) => void;
  onSwipeDelete: (movement: Movement) => void;
  /** Borra todos los ítems de una compra de varios. */
  onSwipeDeletePurchase: (items: Movement[]) => void;
  /** Abre la pantalla para editar una compra de varios. */
  onEditPurchase: (purchaseId: number) => void;
  /** Comercio de cada compra de varios (null si no se cargó). */
  purchaseMerchants: Map<number, string | null>;
  /** Contenido desplazable que precede a los movimientos (p. ej. resumen de Inicio). */
  header?: React.ReactNode;
}

/** Lista de movimientos con swipe-to-delete, o el skeleton mientras carga. */
export function MovementList({
  loading,
  movements,
  isFiltering,
  context,
  fundNameById,
  onPressItem,
  onSwipeDelete,
  onSwipeDeletePurchase,
  onEditPurchase,
  purchaseMerchants,
  header,
}: MovementListProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const [expandedPurchases, setExpandedPurchases] = useState<Set<number>>(new Set());

  // Con un filtro activo se muestran los gastos sueltos: así cada resultado es un ítem real y no un total mezclado.
  const entries = useMemo<MovementListEntry[]>(
    () => (isFiltering ? movements.map((movement) => ({ kind: 'movement', movement })) : groupPurchases(movements)),
    [movements, isFiltering]
  );

  const togglePurchase = useCallback((purchaseId: number) => {
    setExpandedPurchases((prev) => {
      const next = new Set(prev);
      if (next.has(purchaseId)) next.delete(purchaseId);
      else next.add(purchaseId);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <View>
        {header}
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <MovementRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  function closeSwipe(key: string) {
    swipeableRefs.current.get(key)?.close();
  }

  function renderSwipeable(key: string, onDelete: () => void, content: React.ReactNode) {
    return (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(key, ref);
          else swipeableRefs.current.delete(key);
        }}
        renderRightActions={() => (
          <Pressable
            style={styles.deleteAction}
            onPress={() => {
              closeSwipe(key);
              onDelete();
            }}
          >
            <Text style={styles.deleteActionText}>Eliminar</Text>
          </Pressable>
        )}
      >
        {content}
      </Swipeable>
    );
  }

  function renderMovementRow(item: Movement, nested: boolean) {
    const display = describeMovement(item, context, (id) => fundNameById.get(id) ?? 'Fondo');
    const amountColor =
      display.neutral || display.signedAmount == null
        ? theme.textSecondary
        : display.signedAmount >= 0
          ? theme.success
          : theme.danger;
    return renderSwipeable(
      `m${item.id}`,
      () => onSwipeDelete(item),
      <Pressable style={[styles.movementRow, nested && styles.nestedRow]} onPress={() => onPressItem(item.id)}>
        <Text style={[styles.movementIcon, nested && styles.nestedIcon]}>
          {item.type === 'transferencia'
            ? '🔁'
            : item.type === 'ajuste'
              ? '⚖️'
              : iconForCategory(item.category ?? 'Otros')}
        </Text>
        <View style={styles.rowText}>
          <Text style={[styles.movementDescription, nested && styles.nestedDescription]}>{item.description}</Text>
          <View style={styles.movementMetaRow}>
            {item.category ? (
              <View
                style={[styles.categoryDot, { backgroundColor: colorForCategory(item.category, theme.scheme) }]}
              />
            ) : null}
            <Text style={styles.movementCategory}>{display.contextNote ?? display.label}</Text>
            <Text style={styles.movementDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
        </View>
        <Text style={[styles.movementAmount, nested && styles.nestedAmount, { color: amountColor }]}>
          {display.signedAmount == null
            ? formatCurrency(item.amount)
            : formatSignedCurrency(display.signedAmount)}
        </Text>
      </Pressable>
    );
  }

  function renderPurchase(entry: Extract<MovementListEntry, { kind: 'purchase' }>) {
    const expanded = expandedPurchases.has(entry.purchaseId);
    const merchant = purchaseMerchants.get(entry.purchaseId);
    const title = merchant?.trim() || 'Compra de varios';
    return (
      <View>
        {renderSwipeable(
          `p${entry.purchaseId}`,
          () => onSwipeDeletePurchase(entry.items),
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={[styles.movementRow, expanded && styles.purchaseHeaderOpen]}
            onPress={() => togglePurchase(entry.purchaseId)}
          >
            <Text style={styles.movementIcon}>🧾</Text>
            <View style={styles.rowText}>
              <Text style={styles.movementDescription}>{title}</Text>
              <View style={styles.movementMetaRow}>
                <Text style={styles.movementCategory}>
                  {merchant?.trim() ? 'Compra de varios · ' : ''}
                  {entry.items.length} ítems {expanded ? '▾' : '▸'}
                </Text>
                <Text style={styles.movementDate}>
                  {new Date(entry.items[0].createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <Text style={[styles.movementAmount, { color: theme.danger }]}>
              {formatSignedCurrency(-entry.total)}
            </Text>
          </Pressable>
        )}
        {expanded ? (
          <View style={styles.purchaseBody}>
            {entry.items.map((item) => (
              <View key={item.id}>{renderMovementRow(item, true)}</View>
            ))}
            <Pressable
              accessibilityRole="button"
              style={styles.editPurchase}
              onPress={() => onEditPurchase(entry.purchaseId)}
            >
              <Text style={styles.editPurchaseText}>Editar compra ›</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.listContent}
      data={entries}
      keyExtractor={(entry) =>
        entry.kind === 'purchase' ? `p${entry.purchaseId}` : `m${entry.movement.id}`
      }
      ListHeaderComponent={header != null ? <>{header}</> : undefined}
      renderItem={({ item: entry }) =>
        entry.kind === 'purchase' ? renderPurchase(entry) : renderMovementRow(entry.movement, false)
      }
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          {isFiltering
            ? 'No se encontraron movimientos que coincidan con el filtro.'
            : context.kind === 'fund'
              ? 'Este fondo todavía no tiene movimientos.'
              : 'Todavía no registraste movimientos. Tocá "Registrar" para cargar el primero.'}
        </Text>
      }
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    listContent: { paddingVertical: 16, flexGrow: 1 },
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
      paddingHorizontal: 16,
      backgroundColor: theme.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowText: { flex: 1 },
    // Los ítems de una compra abierta forman una tarjeta con un riel a la izquierda:
    // se lee como una sola unidad que cuelga de la ficha, no como filas sueltas.
    purchaseBody: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: theme.primary,
      backgroundColor: theme.surfaceAlt,
      overflow: 'hidden',
    },
    purchaseHeaderOpen: { borderBottomWidth: 0 },
    editPurchase: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    editPurchaseText: { fontSize: 14, fontWeight: '600', color: theme.primary },
    // Opaca (igual que la tarjeta): el botón "Eliminar" del swipe queda detrás y no debe verse.
    nestedRow: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 10,
      backgroundColor: theme.surfaceAlt,
      borderBottomColor: theme.border,
    },
    nestedIcon: { fontSize: 18 },
    nestedDescription: { fontSize: 14 },
    nestedAmount: { fontSize: 14 },
    movementIcon: { fontSize: 22 },
    movementDescription: { fontSize: 16, fontWeight: '500', color: theme.text },
    movementMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    categoryDot: { width: 7, height: 7, borderRadius: 4 },
    movementCategory: { fontSize: 12, color: theme.textSecondary },
    movementDate: { fontSize: 12, color: theme.textMuted, marginLeft: 4 },
    movementAmount: { fontSize: 16, fontWeight: '700', flexShrink: 0 },
    emptyText: { textAlign: 'center', color: theme.textMuted, marginTop: 40, paddingHorizontal: 20 },
  });
}
