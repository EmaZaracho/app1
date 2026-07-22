import React, { useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { describeMovement, type DisplayContext } from '../domain/movementDisplay';
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
}: MovementListProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  if (loading) {
    return (
      <View>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <MovementRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  function handleSwipeDelete(movement: Movement) {
    swipeableRefs.current.get(movement.id)?.close();
    onSwipeDelete(movement);
  }

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.listContent}
      data={movements}
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
            <Pressable style={styles.movementRow} onPress={() => onPressItem(item.id)}>
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
                  <Text style={styles.movementCategory}>{display.contextNote ?? display.label}</Text>
                  <Text style={styles.movementDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
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
              : 'Todavía no registraste movimientos. Tocá "Registrar" para cargar el primero.'}
        </Text>
      }
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
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
  });
}
