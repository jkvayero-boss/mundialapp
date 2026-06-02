import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Colors } from '../constants/theme';

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: Colors.card },
        headerTintColor: Colors.ink,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: Colors.bg },
        animation: 'slide_from_right',
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ title: '' }} />
        <Stack.Screen name="join" options={{ title: '' }} />
        <Stack.Screen name="pool/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="pool/admin" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
