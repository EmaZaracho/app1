import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { CATEGORY_ICON } from '../categoryVisuals';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';

export interface EditableReceiptItem {
  id: string;
  description: string;
  amountText: string;
  category: ExpenseCategory;
}

interface ReceiptItemRowProps {
  item: EditableReceiptItem;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChangeDescription: (v: string) => void;
  onChangeAmount: (v: string) => void;
  onChangeCategory: (c: ExpenseCategory) => void;
  onRemove: () => void;
}

export function ReceiptItemRow({
  item,
  expanded,
  onToggleExpanded,
  onChangeDescription,
  onChangeAmount,
  onChangeCategory,
  onRemove,
}: ReceiptItemRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <TextInput
          style={styles.descriptionInput}
          value={item.description}
          onChangeText={onChangeDescription}
          placeholder="Descripción"
          placeholderTextColor={theme.textMuted}
        />
        <TextInput
          style={styles.amountInput}
          value={item.amountText}
          onChangeText={onChangeAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={theme.textMuted}
        />
        <Pressable style={styles.removeButton} onPress={onRemove}>
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </View>

      <Pressable style={styles.categoryPill} onPress={onToggleExpanded}>
        <Text style={styles.categoryPillText}>
          {CATEGORY_ICON[item.category]} {item.category}
        </Text>
      </Pressable>

      {expanded ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {EXPENSE_CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.categoryChip, cat === item.category && styles.categoryChipSelected]}
              onPress={() => onChangeCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  cat === item.category && styles.categoryChipTextSelected,
                ]}
              >
                {CATEGORY_ICON[cat]} {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    descriptionInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
    },
    amountInput: {
      width: 90,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      textAlign: 'right',
      fontWeight: '700',
    },
    removeButton: { padding: 6 },
    removeText: { color: theme.danger, fontSize: 16, fontWeight: '700' },
    categoryPill: {
      alignSelf: 'flex-start',
      marginTop: 8,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    categoryPillText: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },
    categoryRow: { gap: 8, paddingTop: 10 },
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
  });
}
