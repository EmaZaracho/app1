import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import SummaryScreen from '../screens/SummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Mis gastos' }} />
        <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: 'Resumen' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Configuración' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
