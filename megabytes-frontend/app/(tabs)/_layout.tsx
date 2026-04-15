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
      <Tabs.Screen name="story" options={{ title: 'Story', tabBarIcon: ({ color }) => <TabIcon name="map-outline" color={color} /> }} />
      <Tabs.Screen name="arena" options={{ title: 'Arena', tabBarIcon: ({ color }) => <TabIcon name="flash-outline" color={color} /> }} />
      <Tabs.Screen name="achievements" options={{ title: 'Achievements', tabBarIcon: ({ color }) => <TabIcon name="ribbon-outline" color={color} /> }} />
      <Tabs.Screen name="collection" options={{ title: 'Settings', tabBarIcon: ({ color }) => <TabIcon name="settings-outline" color={color} /> }} />
      <Tabs.Screen name="cash-shop" options={{ href: null }} />
      <Tabs.Screen name="leaderboards" options={{ href: null }} />
      <Tabs.Screen name="marketplace" options={{ href: null }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="events" options={{ href: null }} />
      <Tabs.Screen name="battle" options={{ href: null }} />
      <Tabs.Screen name="pageant" options={{ href: null }} />
      <Tabs.Screen name="shop" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="loadout" options={{ href: null }} />
    </Tabs>
  );
}
