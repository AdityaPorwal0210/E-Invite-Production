import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

// Push Notification Imports
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

// ==========================================
// THE GLOBAL AXIOS OVERRIDE
// ==========================================
axios.defaults.baseURL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

axios.interceptors.request.use(
  async (config) => {
    // Only intercept if we are hitting our own backend
    const isOurApi = !config.url?.startsWith('http') || config.url?.includes('invitoinbox.onrender.com');
    
    if (isOurApi) {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ==========================================
// FOREGROUND NOTIFICATION HANDLER
// ==========================================
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, 
    shouldShowList: true,  
  }),
});

export default function RootLayout() {
  const router = useRouter();
  const url = Linking.useURL();

  // ==========================================
  // 1. BROWSER DEEP LINK CATCHER
  // Handles links clicked from WhatsApp/Email
  // ==========================================
  useEffect(() => {
    if (url) {
      console.log('🔗 Browser Deep Link Caught:', url);
      const parsedUrl = Linking.parse(url);
      
      if (parsedUrl.path && parsedUrl.path.includes('invitation/')) {
        const rawId = parsedUrl.path.split('invitation/').pop();
        
        if (rawId) {
          const cleanId = rawId.split('?')[0].replace(/\//g, '');
          
          if (cleanId) {
            setTimeout(() => {
              router.push(`/event/${cleanId}`);
            }, 500);
          }
        }
      }
    }
  }, [url]);

  // ==========================================
  // 2. PUSH NOTIFICATION TAP CATCHER
  // Handles users tapping a notification banner
  // ==========================================
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      // Extract the custom URL we packed into the backend cron job payload
      const urlFromNotify = response.notification.request.content.data?.url;
      
      // TS FIX: Explicitly check that it exists AND is a string
      if (urlFromNotify && typeof urlFromNotify === 'string') {
        console.log('🔔 Notification Tap Caught URL:', urlFromNotify);
        // Strip the custom scheme so the router understands the path
        const path = urlFromNotify.replace('hostapp://', '/');
        router.push(path as any);
      }
    });

    return () => subscription.remove();
  }, [router]);

  // ==========================================
  // 3. PUSH NOTIFICATION REGISTRATION
  // ==========================================
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token. User denied permission.');
        return;
      }
      
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log("🔥 EXPO PUSH TOKEN:", token);

      const authToken = await AsyncStorage.getItem('authToken');
      if (authToken && token) {
        try {
          await axios.put(`/users/push-token`, { expoPushToken: token });
          console.log("✅ Token saved to database");
        } catch (err) {
          console.log("❌ Failed to save token to database", err);
        }
      }
    } else {
      console.log('Running on simulator: Skipping push notification registration.');
    }

    return token;
  };

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="invitation/[id]" />
        {/* Make sure event/[id] exists in your app folder since we route to it */}
      </Stack>
      <Toast />
    </>
  );
}