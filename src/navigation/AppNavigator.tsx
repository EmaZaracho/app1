import React from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import SummaryScreen from '../screens/SummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MovementDetailScreen from '../screens/MovementDetailScreen';
import BudgetsScreen from '../screens/BudgetsScreen';
import FundsScreen from '../screens/FundsScreen';
import FundEditorScreen from '../screens/FundEditorScreen';
import FinancialInsightsScreen from '../screens/FinancialInsightsScreen';
import CategoryPrioritySettingsScreen from '../screens/CategoryPrioritySettingsScreen';
import ReceiptReviewScreen from '../screens/ReceiptReviewScreen';
import FinancialCalendarScreen from '../screens/FinancialCalendarScreen';
import RecurringExpenseEditorScreen from '../screens/RecurringExpenseEditorScreen';
import RecurringExpenseDetailScreen from '../screens/RecurringExpenseDetailScreen';
import RecurringOccurrenceDetailScreen from '../screens/RecurringOccurrenceDetailScreen';
import RegisterOccurrencePaymentScreen from '../screens/RegisterOccurrencePaymentScreen';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { useTheme } from '../theme';
import type { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const theme = useTheme();
  const navTheme = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer
      theme={{
        ...navTheme,
        colors: {
          ...navTheme.colors,
          background: theme.bg,
          card: theme.surface,
          text: theme.text,
          border: theme.border,
          primary: theme.primary,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Mis finanzas', headerRight: () => <ThemeToggleButton /> }}
        />
        <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: 'Resumen' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Configuración' }} />
        <Stack.Screen name="Budgets" component={BudgetsScreen} options={{ title: 'Presupuestos' }} />
        <Stack.Screen name="Funds" component={FundsScreen} options={{ title: 'Fondos' }} />
        <Stack.Screen name="FundEditor" component={FundEditorScreen} options={{ title: 'Fondo' }} />
        <Stack.Screen
          name="FinancialInsights"
          component={FinancialInsightsScreen}
          options={{ title: 'Análisis financiero' }}
        />
        <Stack.Screen
          name="CategoryPrioritySettings"
          component={CategoryPrioritySettingsScreen}
          options={{ title: 'Prioridad de categorías' }}
        />
        <Stack.Screen
          name="ReceiptReview"
          component={ReceiptReviewScreen}
          options={{ title: 'Revisar factura' }}
        />
        <Stack.Screen
          name="MovementDetail"
          component={MovementDetailScreen}
          options={{ title: 'Editar movimiento' }}
        />
        <Stack.Screen
          name="FinancialCalendar"
          component={FinancialCalendarScreen}
          options={{ title: 'Calendario financiero' }}
        />
        <Stack.Screen
          name="RecurringExpenseEditor"
          component={RecurringExpenseEditorScreen}
          options={{ title: 'Recurrencia' }}
        />
        <Stack.Screen
          name="RecurringExpenseDetail"
          component={RecurringExpenseDetailScreen}
          options={{ title: 'Recurrencia' }}
        />
        <Stack.Screen
          name="RecurringOccurrenceDetail"
          component={RecurringOccurrenceDetailScreen}
          options={{ title: 'Ocurrencia' }}
        />
        <Stack.Screen
          name="RegisterOccurrencePayment"
          component={RegisterOccurrencePaymentScreen}
          options={{ title: 'Registrar pago' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
