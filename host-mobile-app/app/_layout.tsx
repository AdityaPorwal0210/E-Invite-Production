import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useSegments, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  // Auth Guard with Deep-Link Capture
  // Auth Guard with Deep-Link Capture
  useEffect(() => {
    const enforceAuth = async () => {
      // 1. Do not act until Expo Router has actually mounted the path segments
      if (!segments || !segments[0]) return;
      const currentPath = pathname;
      const firstSegment = segments[0];
      const token = await AsyncStorage.getItem('authToken');

      // 2. Define what counts as an unprotected route (Login screen)
      const isLoginScreen = currentPath === '/' || firstSegment === 'index';

      console.log(`--- ROUTER CHECK ---`);
      console.log(`Target Path: ${currentPath}`);
      console.log(`Has Token: ${!!token}`);

      // 3. The Intercept Logic
      if (!token && !isLoginScreen) {
        console.log(`🚨 Unauthorized route attempt intercepted!`);
        
        // Save the deep link specifically for events/invitations
        if (currentPath.includes('/invitation') || currentPath.includes('/event')) {
          await AsyncStorage.setItem('pendingRoute', currentPath);
          console.log(`✅ MEMORY SAVED: pendingRoute -> ${currentPath}`);
        } else {
          console.log(`Ignored path for memory: ${currentPath}`);
        }

        // 4. Kick to the front door
        router.replace('/');
      }
    };

    enforceAuth();
  }, [segments, pathname]); // Re-run this check exactly when the route actually changes

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack initialRouteName="index">
        <Stack.Screen 
          name="index" 
          options={{ 
            headerShown: false,
            title: 'Login'
          }} 
        />
        <Stack.Screen 
          name="dashboard" 
          options={{ 
            headerShown: false,
            title: 'Dashboard'
          }} 
        />
        <Stack.Screen 
          name="create" 
          options={{ 
            headerShown: false,
            title: 'Create Event'
          }} 
        />
        <Stack.Screen 
          name="invitation/[id]" 
          options={{ 
            headerShown: false,
            title: 'Invitation'
          }} 
        />
        <Stack.Screen 
          name="event/[id]" 
          options={{ 
            headerShown: false,
            title: 'Event Details'
          }} 
        />
        <Stack.Screen 
          name="saved" 
          options={{ 
            headerShown: false,
            title: 'Saved Events'
          }} 
        />
        <Stack.Screen 
          name="groups" 
          options={{ 
            headerShown: false,
            title: 'Groups'
          }} 
        />
        <Stack.Screen 
          name="invite/[id]" 
          options={{ 
            headerShown: false,
            title: 'Invite Guests'
          }} 
        />
        <Stack.Screen 
          name="edit/[id]" 
          options={{ 
            headerShown: false,
            title: 'Edit Event'
          }} 
        />
        <Stack.Screen 
          name="modal" 
          options={{ 
            presentation: 'modal', 
            title: 'Modal' 
          }} 
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
