import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme, type Theme } from '../theme';

interface HomeActionMenuProps {
  onRegisterAI: () => void;
  onRegisterManual: () => void;
  onScanReceipt: () => void;
  onTransfer: () => void;
}

/**
 * Única acción principal de Inicio para registrar operaciones. Usa `Alert`
 * (componente nativo) en vez de una librería de action sheet para mantener
 * la dependencia liviana.
 */
export function HomeActionMenu({ onRegisterAI, onRegisterManual, onScanReceipt, onTransfer }: HomeActionMenuProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  function openMenu() {
    Alert.alert('Registrar', '¿Qué querés hacer?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Registrar con IA', onPress: onRegisterAI },
      { text: 'Registrar manualmente', onPress: onRegisterManual },
      { text: 'Escanear comprobante', onPress: onScanReceipt },
      { text: 'Transferir entre fondos', onPress: onTransfer },
    ]);
  }

  return (
    <Pressable
      style={styles.button}
      onPress={openMenu}
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
