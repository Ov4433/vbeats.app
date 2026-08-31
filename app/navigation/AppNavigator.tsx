import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import RecordBeatScreen from '../screens/RecordBeatScreen';
import BeatDetailScreen from '../screens/BeatDetailScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
      <Stack.Screen name="RecordBeat" component={RecordBeatScreen} />
      <Stack.Screen name="BeatDetail" component={BeatDetailScreen} />
    </Stack.Navigator>
  );
}
