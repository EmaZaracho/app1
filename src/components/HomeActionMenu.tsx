import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme, type Theme } from '../theme';

interface HomeActionMenuProps {
  onRegisterManual: () => void;
}

/**
 * Acción principal de Inicio: abre directo el formulario manual. El registro
 * con IA y el escaneo viven en la barra de texto de abajo, y la transferencia
 * se elige en el selector de tipo del propio formulario.
 */
export function HomeActionMenu({ onRegisterManual }: HomeActionMenuProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      style={styles.button}
      onPress={onRegisterManual}
      accessibilityRole="button"
      accessibilityLabel="Registrar"
    >
      <Text style={styles.text}>＋ Registrar</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    button: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      marginHorizontal: 16,
      marginBottom: 8,
      alignItems: 'center',
    },
    text: { color: theme.primaryText, fontWeight: '700', fontSize: 15 },
  });
}
