import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import CardsScreen from '../screens/CardsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

// The Rapchat signature: a big raised red record button in the center of
// the bar. It is not a tab — it opens the studio (RecordBeat) on the stack.
function RecordTabButton() {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.recWrap}>
      <TouchableOpacity
        style={styles.recBtn}
        activeOpacity={0.85}
        onPress={() => navigation.getParent()?.navigate('RecordBeat')}
        accessibilityLabel="Record"
      >
        <View style={styles.recDot} />
      </TouchableOpacity>
      <Text style={styles.recLabel}>Record</Text>
    </View>
  );
}

const EmptyScreen = () => null;

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0f',
          borderTopColor: '#23232e',
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: '#ff3d9a',
        tabBarInactiveTintColor: '#888',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Record"
        component={EmptyScreen}
        options={{
          tabBarButton: () => <RecordTabButton />,
        }}
      />
      <Tab.Screen
        name="Cards"
        component={CardsScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'albums' : 'albums-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  recWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  recBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e8230f',
    borderWidth: 3,
    borderColor: '#2a0f0c',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    shadowColor: '#e8230f',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  recDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  recLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
});
