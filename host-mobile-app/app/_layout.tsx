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
// THE GLOBAL AXIOS OVERRIDE (THE SAFETY NET)
// ==========================================
axios.defaults.baseURL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

axios.interceptors.request.use(
  async (config) => {
    // Only intercept if we are hitting our own backend (prevent leaking token to third parties)
    const isOurApi = !config.url?.startsWith('http') || config.url?.includes('invitoinbox.onrender.com');
    
    if (isOurApi) {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        // This will override any missing tokens globally
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

// Tell the app how to handle notifications when it is actively open on the screen
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

  // --- THE DEEP LINK CATCHER ---
  useEffect(() => {
    if (url) {
      console.log('🔗 Deep Link Caught:', url);
      const parsedUrl = Linking.parse(url);
      
      // If the URL contains '/invitation/', grab the ID and route to the event screen
      if (parsedUrl.path && parsedUrl.path.includes('invitation/')) {
        const rawId = parsedUrl.path.split('invitation/').pop();
        
        // TS FIX: Guarantee rawId exists before operating on it
        if (rawId) {
          // Sanitize: Strip any accidentally attached query params or slashes
          const cleanId = rawId.split('?')[0].replace(/\//g, '');
          
          if (cleanId) {
            // Add a tiny delay to ensure navigation is ready if it's a cold start
            setTimeout(() => {
              router.push(`/event/${cleanId}`);
            }, 500);
          }
        }
      }
    }
  }, [url]);

  // --- PUSH NOTIFICATION HARVESTER ---
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    let token;

    // Android requires specific channel configuration
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Push notifications do not work on iOS Simulators, must check for physical device
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      // If we don't have permission, explicitly ask the user for it
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token. User denied permission.');
        return;
      }
      
      // Grab the unique device token from Expo's servers
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log("🔥 EXPO PUSH TOKEN:", token);

      // Securely vault the token in your backend if the user is currently logged in
      const authToken = await AsyncStorage.getItem('authToken');
      if (authToken && token) {
        try {
          // Because of the global override above, we don't even need to pass the headers here anymore.
          // The interceptor will attach the token automatically.
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
        {/* Note: I am leaving your invitation/[id] screen here just in case, but deep links will now route to event/[id] */}
        <Stack.Screen name="invitation/[id]" />
      </Stack>
      
      {/* 🚨 This MUST sit here so it renders globally over all screens */}
      <Toast />
    </>
  );
}