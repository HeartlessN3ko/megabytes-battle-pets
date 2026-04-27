import { Tabs } from 'expo-router';
import HomeNavBar from '../../components/HomeNavBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={() => <HomeNavBar />}
      screenOptions={{ headerShown: false }}
    >
      {/* Visible tab screens — icons/titles handled by HomeNavBar, not the tab bar */}
      <Tabs.Screen name="index"        options={{ title: 'Home' }} />
      <Tabs.Screen name="story"        options={{ title: 'Story' }} />
      <Tabs.Screen name="arena"        options={{ title: 'Arena' }} />
      <Tabs.Screen name="achievements" options={{ title: 'Achievements' }} />

      {/* Hidden screens — navigated to programmatically */}
      <Tabs.Screen name="achievements-sheet" options={{ href: null }} />
      <Tabs.Screen name="cash-shop"    options={{ href: null }} />
      <Tabs.Screen name="leaderboards" options={{ href: null }} />
      <Tabs.Screen name="marketplace"  options={{ href: null }} />
      <Tabs.Screen name="inbox"        options={{ href: null }} />
      <Tabs.Screen name="profile"      options={{ href: null }} />
      <Tabs.Screen name="events"       options={{ href: null }} />
      <Tabs.Screen name="battle"       options={{ href: null }} />
      <Tabs.Screen name="pageant"      options={{ href: null }} />
      <Tabs.Screen name="shop"         options={{ href: null }} />
      <Tabs.Screen name="inventory"    options={{ href: null }} />
      <Tabs.Screen name="loadout"      options={{ href: null }} />
      <Tabs.Screen name="daily-care"   options={{ href: null }} />
    </Tabs>
  );
}
