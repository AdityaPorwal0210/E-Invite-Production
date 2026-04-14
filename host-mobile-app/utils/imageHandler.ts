import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert } from 'react-native';

export const pickAndCompressImages = async (maxImages: number = 5) => {
  try {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1, 
      allowsMultipleSelection: true,
      selectionLimit: maxImages,
    });

    if (!result.canceled && result.assets) {
      const compressedImages = await Promise.all(
        result.assets.map(async (asset) => {
          const compressed = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: 1080 } }], 
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );

          return {
            uri: compressed.uri,
            name: asset.fileName || `photo_${Date.now()}.jpg`,
            type: 'image/jpeg',
          };
        })
      );
      return compressedImages;
    }
    return [];
  } catch (error) {
    console.log("Compression Error:", error);
    Alert.alert('Error', 'Failed to process images');
    return [];
  }
};