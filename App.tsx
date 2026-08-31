import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './app/context/AuthContext';
import BottomTabNavigator from './app/navigation/BottomTabNavigator';
import { initializeBlockchain } from './app/services/blockchain';
import { StyleSheet } from 'react-native';

export default function App() {
  useEffect(() => {
    // Initialize blockchain on app startup
    initializeBlockchain();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <AuthProvider>
        <NavigationContainer>
          <BottomTabNavigator />
        </NavigationContainer>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});