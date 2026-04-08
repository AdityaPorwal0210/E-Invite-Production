// @ts-ignore
import AsyncStorage from '@react-native-async-storage/async-storage';

export const cacheData = async (key: string, data: any) => {
  try {
    const jsonValue = JSON.stringify(data);
    await AsyncStorage.setItem(key, jsonValue);
  } catch (error) {
    console.error(`❌ Cache Write Error [${key}]:`, error);
  }
};

export const getCachedData = async (key: string) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    console.error(`❌ Cache Read Error [${key}]:`, error);
    return null;
  }
};