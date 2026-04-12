import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

function TabIcon({ name, color }: { name: string; color: string }) {
  return <Ionicons name={name as any} size={20} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(5,12,40,0.97)',
          borderTopColor: 'rgba(80,160,255,0.2)',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarActiveTintColor: '#7ec8ff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} /> }} />
      <Tabs.Screen name="battle" options={{ title: 'Battle', tabBarIcon: ({ color }) => <TabIcon name="flash-outline" color={color} /> }} />
      <Tabs.Screen name="pageant" options={{ title: 'Pageant', tabBarIcon: ({ color }) => <TabIcon name="trophy-outline" color={color} /> }} />
      <Tabs.Screen name="collection" options={{ title: 'Options', tabBarIcon: ({ color }) => <TabIcon name="settings-outline" color={color} /> }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: ({ color }) => <TabIcon name="cart-outline" color={color} /> }} />
    </Tabs>
  );
}
