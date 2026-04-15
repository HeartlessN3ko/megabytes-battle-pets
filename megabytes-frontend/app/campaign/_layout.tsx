import { Stack } from 'expo-router';

export default function CampaignLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animationEnabled: true }}>
      <Stack.Screen name="node" />
      <Stack.Screen name="reward" />
    </Stack>
  );
}
