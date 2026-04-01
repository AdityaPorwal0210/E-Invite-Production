import { useEffect, useState } from 'react';
import { Stack, useRouter, usePathname, useRootNavigationState } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';

// 1. FREEZE THE UI visually.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const osUrl = Linking.useURL(); 
  
  // THE FIX: This is the official Expo way to know if the router has finished booting
  const navigationState = useRootNavigationState(); 
  
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 2. Do absolutely nothing until the Navigation State has a valid key
    if (!navigationState?.key) return;

    const enforceAuth = async () => {
      try {
        console.log(`--- APP WAKE UP ---`);
        console.log(`OS URL: ${osUrl}`);
        console.log(`Router Path: ${pathname}`);

        const token = await AsyncStorage.getItem('authToken');
        
        // Simpler check for the front door
        const isLoginScreen = pathname === '/' || pathname === '/index';

        // 3. Intercept Logic
        if (!token && !isLoginScreen) {
          console.log(`🚨 Unauthorized attempt intercepted!`);
          
          const targetPath = osUrl || pathname;

          if (targetPath && (targetPath.includes('/invitation') || targetPath.includes('/event'))) {
            const cleanRoute = targetPath.split('/--')[1] || targetPath;
            await AsyncStorage.setItem('pendingRoute', cleanRoute);
            console.log(`✅ MEMORY SAVED: pendingRoute -> ${cleanRoute}`);
          }

          router.replace('/');
        }
      } catch (error) {
        console.error('Layout Guard Error:', error);
      } finally {
        // 4. Drop the Splash Screen safely
        if (!isReady) {
          setIsReady(true);
          await SplashScreen.hideAsync();
        }
      }
    };

    enforceAuth();
  }, [navigationState?.key, pathname, osUrl]); // React to the exact moment navigation is ready

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="create" />
      <Stack.Screen name="invitation/[id]" />
      <Stack.Screen name="event/[id]" />
      <Stack.Screen name="saved" />
      <Stack.Screen name="groups" />
      <Stack.Screen name="invite/[id]" />
      <Stack.Screen name="edit/[id]" />
    </Stack>
  );
}