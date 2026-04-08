import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * Custom hook that listens to network connectivity status
 * Returns a boolean isOffline indicating whether the device is currently offline
 */
export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    // Initial check - get current connectivity state
    const checkConnectivity = async () => {
      const state: NetInfoState = await NetInfo.fetch();
      setIsOffline(!state.isConnected);
    };

    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = !state.isConnected;
      setIsOffline(offline);
      
      if (offline) {
        console.log('📡 Network: OFFLINE');
      } else {
        console.log('📡 Network: ONLINE');
      }
    });

    // Initial check
    checkConnectivity();

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  return isOffline;
}

export default useNetworkStatus;
