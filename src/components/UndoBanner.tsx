import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { ARROW_HIT_SLOP } from './touchTargets';

interface UndoBannerProps {
  visible: boolean;
  onUndo: () => void;
  message?: string;
}

export function UndoBanner({ visible, onUndo, message = 'Movimiento eliminado.' }: UndoBannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!visible) return null;

  return (
    <View style={styles.undoBanner}>
      <Text style={styles.undoText}>{message}</Text>
      <Pressable onPress={onUndo} hitSlop={ARROW_HIT_SLOP} accessibilityRole="button">
        <Text style={styles.undoButtonText}>Deshacer</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
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
  });
}
