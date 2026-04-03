import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert, 
  Image, 
  StyleSheet,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme'; 

const API_URL = 'https://invitoinbox.onrender.com/api/invitations';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [googleMapsLink, setGoogleMapsLink] = useState('');
  const [image, setImage] = useState<string | null>(null);

  // Security & UI State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authCheckComplete, setAuthCheckComplete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      checkAuthAndFetch();
    }, [id])
  );

  const checkAuthAndFetch = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');

      // 1. THE BOUNCER: Kick unauthenticated users
      if (!token) {
        console.log('🚨 Unauthenticated attempt to access Edit Screen. Redirecting...');
        setAuthCheckComplete(true);
        setLoading(false);
        await AsyncStorage.setItem('pendingRoute', `/edit/${id}`);
        router.replace('/');
        return;
      }

      // 2. Identify the current user
      const userStr = await AsyncStorage.getItem('user');
      let currentId = null;
      if (userStr) {
        const userData = JSON.parse(userStr);
        currentId = userData._id || userData.id;
      }

      // 3. Fetch Event Details
      const response = await axios.get(`${API_URL}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const event = response.data;

      // 4. THE VAULT: Verify Host Status
      const ownerId = event.host?._id || event.user;
      
      if (currentId !== ownerId) {
        console.log('🛑 UNAUTHORIZED: User is not the host of this event.');
        Alert.alert('Unauthorized', 'You do not have permission to edit this event.');
        
        // Send them to the safe view-only page
        router.replace(`/event/${id}`);
        return;
      }

      // 5. Safe to load data into the form
      setTitle(event.title || '');
      setDescription(event.description || '');
      
      // Format date for text input (YYYY-MM-DD)
      if (event.eventDate) {
        setDate(new Date(event.eventDate).toISOString().split('T')[0]);
      }
      
      setVenue(event.location || '');
      setVideoUrl(event.videoUrl || '');
      setGoogleMapsLink(event.googleMapsLink || '');
      setImage(event.coverImage || null);
      
      setAuthCheckComplete(true);
    } catch (error) {
      console.error('❌ Failed to load event details:', error);
      Alert.alert('Error', 'Failed to load event details. It may have been deleted.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImage(result.assets[0].uri);
    }
  };

  const updateEvent = async () => {
    if (!title.trim() || !date.trim() || !venue.trim()) {
      Alert.alert('Error', 'Title, Date, and Venue are required fields.');
      return;
    }

    setSaving(true);

    try {
      const token = await AsyncStorage.getItem('authToken');
      
      // 1. Construct FormData
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('eventDate', date.trim());
      formData.append('location', venue.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (videoUrl.trim()) formData.append('videoUrl', videoUrl.trim());
      if (googleMapsLink.trim()) formData.append('googleMapsLink', googleMapsLink.trim());

      // 2. The Bulletproof File Append
      if (image && !image.startsWith('http')) {
        const filename = image.split('/').pop() || 'upload.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        // Fix for iOS file paths
        const localUri = Platform.OS === 'ios' ? image.replace('file://', '') : image;

        // CRITICAL: Using 'attachments' to match your Web App's payload
        formData.append('coverImage', {
          uri: localUri,
          name: filename,
          type: type,
        } as any);
      }

      // 3. The Native Fetch Override (Bypassing Axios for Multipart)
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          // Do NOT set Content-Type here. Fetch sets the multipart boundary automatically.
        },
        body: formData,
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || 'Server rejected the update');
      }

      Alert.alert('Success', 'Event updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
      
    } catch (error: any) {
      console.error('Update Error:', error.message);
      Alert.alert('Error', error.message || 'Failed to update event');
    } finally {
      setSaving(false);
    }
  };

  // --- RENDERING GUARDS ---
  if (loading || !authCheckComplete) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <Stack.Screen options={{ title: 'Edit Event', headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Edit Event', headerShown: false }} />
      <Text style={styles.header}>Edit Event</Text>

      {/* Image Picker */}
      <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
        {image ? (
          <Image source={{ uri: image }} style={styles.imagePreview} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>+ Add Cover Image</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Core Fields */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Event Title *</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Enter title" />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Date (YYYY-MM-DD) *</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-12-31" />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Venue / Location *</Text>
        <TextInput style={styles.input} value={venue} onChangeText={setVenue} placeholder="Enter location" />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput 
          style={[styles.input, styles.textArea]} 
          value={description} 
          onChangeText={setDescription} 
          placeholder="Event details..." 
          multiline 
          numberOfLines={4} 
        />
      </View>

      {/* Advanced Fields */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Video URL (Optional)</Text>
        <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} placeholder="YouTube or Vimeo link" autoCapitalize="none" />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Google Maps Link (Optional)</Text>
        <TextInput style={styles.input} value={googleMapsLink} onChangeText={setGoogleMapsLink} placeholder="Maps URL" autoCapitalize="none" />
      </View>

      <TouchableOpacity 
        style={[styles.saveButton, saving && { opacity: 0.7 }]} 
        onPress={updateEvent} 
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.screenPadding, paddingBottom: SPACING.xl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { ...TYPOGRAPHY.title, marginBottom: SPACING.lg },
  
  imagePicker: { width: '100%', height: 200, backgroundColor: COLORS.input, borderRadius: 12, overflow: 'hidden', marginBottom: SPACING.lg, ...SHADOWS.card },
  imagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderText: { ...TYPOGRAPHY.bodyMuted, fontWeight: 'bold' },

  inputGroup: { marginBottom: SPACING.md },
  label: { ...TYPOGRAPHY.body, fontWeight: '600', marginBottom: SPACING.xs },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: SPACING.md, ...TYPOGRAPHY.body },
  textArea: { height: 100, textAlignVertical: 'top' },

  saveButton: { backgroundColor: COLORS.primary, padding: SPACING.md, borderRadius: 12, alignItems: 'center', marginTop: SPACING.lg },
  saveButtonText: { color: COLORS.card, fontWeight: 'bold', fontSize: 16 },
});