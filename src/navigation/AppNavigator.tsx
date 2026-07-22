import React from 'react';
import { Text } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import SummaryScreen from '../screens/SummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MovementFormScreen from '../screens/MovementFormScreen';
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
import { MAIN_TABS } from './navigationConfig';
import type { MainTabParamList, RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_SCREEN_TITLES: Record<keyof MainTabParamList, string> = {
  HomeTab: 'Mis finanzas',
  CalendarTab: 'Calendario financiero',
  SummaryTab: 'Resumen',
  SettingsTab: 'Configuración',
};

/** Busca label/icono en MAIN_TABS (fuente única) para no duplicar esos datos acá. */
function tabIconAndLabel(name: keyof MainTabParamList) {
  const entry = MAIN_TABS.find((t) => t.name === name)!;
  return { label: entry.label, icon: entry.icon };
}

function MainTabs() {
  const theme = useTheme();
  const homeTab = tabIconAndLabel('HomeTab');
  const calendarTab = tabIconAndLabel('CalendarTab');
  const summaryTab = tabIconAndLabel('SummaryTab');
  const settingsTab = tabIconAndLabel('SettingsTab');

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        headerRight: () => <ThemeToggleButton />,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: TAB_SCREEN_TITLES.HomeTab,
          tabBarLabel: homeTab.label,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{homeTab.icon}</Text>,
        }}
      />
      <Tab.Screen
        name="CalendarTab"
        component={FinancialCalendarScreen}
        options={{
          title: TAB_SCREEN_TITLES.CalendarTab,
          tabBarLabel: calendarTab.label,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{calendarTab.icon}</Text>,
        }}
      />
      <Tab.Screen
        name="SummaryTab"
        component={SummaryScreen}
        options={{
          title: TAB_SCREEN_TITLES.SummaryTab,
          tabBarLabel: summaryTab.label,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{summaryTab.icon}</Text>,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: TAB_SCREEN_TITLES.SettingsTab,
          tabBarLabel: settingsTab.label,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{settingsTab.icon}</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

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
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="MovementForm" component={MovementFormScreen} options={{ title: 'Registrar movimiento' }} />
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
