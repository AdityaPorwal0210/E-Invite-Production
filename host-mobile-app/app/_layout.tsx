import Toast from 'react-native-toast-message';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="invitation/[id]" />
      </Stack>
      
      {/* 🚨 This MUST sit here so it renders globally over all screens */}
      <Toast />
    </>
  );
}