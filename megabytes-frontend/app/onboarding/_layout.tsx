import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="flow" />
      <Stack.Screen name="egg-select" />
    </Stack>
  );
}
