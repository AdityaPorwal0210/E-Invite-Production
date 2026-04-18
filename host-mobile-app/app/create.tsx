import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
// Note the import of DateTimePickerAndroid here:
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { pickAndCompressImages } from '../utils/imageHandler';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';

const API_URL = 'https://invitoinbox.onrender.com/api/invitations/create';

export default function CreateEvent() {
  const router = useRouter();
  
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [googleMapsLink, setGoogleMapsLink] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 1. iOS Handler (Declarative)
  const onIOSDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  // 2. Android Handler (Imperative - Fixes the crash)
  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            setDate(selectedDate);
            // Chain the Time picker immediately after Date is picked
            DateTimePickerAndroid.open({
              value: selectedDate,
              mode: 'time',
              onChange: (timeEvent, selectedTime) => {
                if (timeEvent.type === 'set' && selectedTime) {
                  setDate(selectedTime);
                }
              },
            });
          }
        },
      });
    } else {
      // If it's iOS, just toggle the boolean to show the component
      setShowPicker(true);
    }
  };

  const pickImage = async () => {
    const newImages = await pickAndCompressImages(5); 
    if (newImages.length > 0) {
      const combined = [...attachments, ...newImages].slice(0, 5);
      setAttachments(combined);
    }
  };

  const removeAttachment = (index: number) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    setAttachments(newAttachments);
  };

  const submitEvent = async () => {
    if (!title.trim() || !location.trim()) {
      Alert.alert('Missing Info', 'Please fill in the title and location.');
      return;
    }

    const urlPattern = new RegExp('^(https?:\\/\\/)?'+ '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ '((\\d{1,3}\\.){3}\\d{1,3}))'+ '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ '(\\?[;&a-z\\d%_.~+=-]*)?'+ '(\\#[-a-z\\d_]*)?$','i');
    
    if (videoUrl && !urlPattern.test(videoUrl)) {
      Alert.alert('Invalid Link', 'The video URL is malformed.');
      return;
    }

    setLoading(true);

    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        router.replace('/');
        return;
      }

      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('eventDate', date.toISOString());
      formData.append('location', location.trim());
      formData.append('description', description.trim());
      formData.append('videoUrl', videoUrl.trim());
      formData.append('googleMapsLink', googleMapsLink.trim());

      attachments.forEach((attachment, index) => {
        formData.append('attachments', {
          uri: attachment.uri,
          type: attachment.type || 'image/jpeg',
          name: attachment.name || `img_${index}.jpg`,
        } as any);
      });

      const response = await axios.post(API_URL, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60000, 
      });

      Alert.alert('Success', 'Invitation Sent!', [
        { text: 'OK', onPress: () => router.replace('/dashboard') }
      ]);
    } catch (error: any) {
      const msg = error.response?.data?.message || "Check your internet connection and try again.";
      Alert.alert('Upload Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Create Event', headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Event</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Event Title *</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Enter event title" placeholderTextColor={COLORS.textMuted} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Event Date *</Text>
          {/* Note: We call openDatePicker here instead of setShowPicker(true) */}
          <TouchableOpacity style={styles.input} onPress={openDatePicker}>
            <Text>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>
          
          {/* Only render this declaratively if we are on iOS */}
          {Platform.OS === 'ios' && showPicker && (
            <DateTimePicker
              value={date}
              mode="datetime"
              display="default"
              onChange={onIOSDateChange}
              minimumDate={new Date()}
            />
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Location *</Text>
          <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Enter venue/location" placeholderTextColor={COLORS.textMuted} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Video URL (Optional)</Text>
          <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} placeholder="YouTube or video link" placeholderTextColor={COLORS.textMuted} keyboardType="url" autoCapitalize="none" />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Google Maps Link (Optional)</Text>
          <TextInput style={styles.input} value={googleMapsLink} onChangeText={setGoogleMapsLink} placeholder="http://maps.google.com/..." placeholderTextColor={COLORS.textMuted} keyboardType="url" autoCapitalize="none" />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Enter event description" placeholderTextColor={COLORS.textMuted} multiline numberOfLines={4} textAlignVertical="top" />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Attachments (max 5)</Text>
          <TouchableOpacity style={styles.attachmentButton} onPress={pickImage}>
            <Text style={styles.attachmentIcon}>📷</Text>
            <Text style={styles.attachmentText}>Select Images from Gallery</Text>
          </TouchableOpacity>
          
          {attachments.length > 0 && (
            <View style={styles.attachmentPreviewContainer}>
              {attachments.map((attachment, index) => (
                <View key={index} style={styles.attachmentPreview}>
                  <Image source={{ uri: attachment.uri }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removeButton} onPress={() => removeAttachment(index)}>
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity style={[styles.submitButton, loading && styles.submitButtonDisabled]} onPress={submitEvent} disabled={loading} activeOpacity={0.8}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Create Event</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backButtonText: { fontSize: 24, color: COLORS.text },
  headerTitle: { flex: 1, ...TYPOGRAPHY.header, textAlign: 'center' },
  headerSpacer: { width: 40 },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
  inputGroup: { marginBottom: SPACING.md },
  label: { ...TYPOGRAPHY.body, fontWeight: '600', marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, ...TYPOGRAPHY.body, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center' },
  textArea: { height: 120, paddingTop: SPACING.md },
  attachmentButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, borderRadius: 12, padding: SPACING.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border },
  attachmentIcon: { fontSize: 24, marginRight: SPACING.sm },
  attachmentText: { ...TYPOGRAPHY.body, color: COLORS.textMuted, fontWeight: '500' },
  attachmentPreviewContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.sm, gap: SPACING.sm },
  attachmentPreview: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  removeButton: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.danger, justifyContent: 'center', alignItems: 'center' },
  removeText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  submitButton: { backgroundColor: COLORS.primary, borderRadius: 12, padding: SPACING.md + 2, alignItems: 'center', marginTop: SPACING.lg },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});