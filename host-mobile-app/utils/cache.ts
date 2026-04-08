import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache data to local storage
 * @param key - The cache key identifier
 * @param data - The data to cache
 */
export const cacheData = async (key: string, data: any) => {
  try {
    const jsonValue = JSON.stringify(data);
    await AsyncStorage.setItem(key, jsonValue);
    console.log(`✅ Cache Write Success [${key}]`);
  } catch (error) {
    console.error(`❌ Cache Write Error [${key}]:`, error);
  }
};

/**
 * Get cached data from local storage
 * @param key - The cache key identifier
 * @returns The cached data or null if not found/error
 */
export const getCachedData = async (key: string) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    if (jsonValue != null) {
      console.log(`✅ Cache Read Success [${key}]`);
      return JSON.parse(jsonValue);
    }
    console.log(`⚠️ Cache Miss [${key}] - No cached data found`);
    return null;
  } catch (error) {
    console.error(`❌ Cache Read Error [${key}]:`, error);
    return null;
  }
};

/**
 * Clear specific cache entry
 * @param key - The cache key to clear
 */
export const clearCache = async (key: string) => {
  try {
    await AsyncStorage.removeItem(key);
    console.log(`✅ Cache Cleared [${key}]`);
  } catch (error) {
    console.error(`❌ Cache Clear Error [${key}]:`, error);
  }
};

// Cache keys for offline data
export const CACHE_KEYS = {
  GROUPS: 'cached_groups',
  INVITATIONS: 'cached_invitations',
  INVITATIONS_RECEIVED: 'cached_invitations_received',
} as const;
