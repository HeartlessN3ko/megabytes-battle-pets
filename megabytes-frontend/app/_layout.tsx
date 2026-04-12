import { Stack } from 'expo-router';
import { EvolutionProvider } from '../context/EvolutionContext';

export default function RootLayout() {
  return (
    <EvolutionProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="egg" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </EvolutionProvider>
  );
}
