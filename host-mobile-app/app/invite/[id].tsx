import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, FlatList, Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';

const API_URL = 'https://invitoinbox.onrender.com/api';

interface SelectedUser {
  _id: string; // Will be actual ID, 'email_...', or 'phone_...'
  name: string;
  contactMethod: string; // The email or phone number
  type: 'registered' | 'email' | 'phone';
  salutation: string;
}

export default function InviteScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  // State
  const [userSearch, setUserSearch] = useState<string>('');
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [existingGuestIds, setExistingGuestIds] = useState<string[]>([]);
  
  // Contacts State
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

  // Security & UI State
  const [loading, setLoading] = useState<boolean>(true);
  const [inviting, setInviting] = useState<boolean>(false);
  const [authCheckComplete, setAuthCheckComplete] = useState<boolean>(false);
  const [eventDetails, setEventDetails] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      checkAuthAndVerifyHost();
    }, [id])
  );

  const checkAuthAndVerifyHost = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');

      if (!token) {
        setAuthCheckComplete(true);
        setLoading(false);
        await AsyncStorage.setItem('pendingRoute', `/invite/${id}`);
        router.replace('/');
        return;
      }

      const userStr = await AsyncStorage.getItem('user');
      let currentId = null;
      if (userStr) {
        currentId = JSON.parse(userStr)._id || JSON.parse(userStr).id;
      }

      const response = await axios.get(`${API_URL}/invitations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setEventDetails(response.data);
      const ownerId = response.data.host?._id || response.data.user;
      
      if (currentId !== ownerId) {
        Alert.alert('Unauthorized', 'You do not have permission to invite guests.');
        router.replace(`/event/${id}`); 
        return;
      }

      await fetchExistingGuests(token);
      setAuthCheckComplete(true);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load event details.');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingGuests = async (token: string) => {
    try {
      const response = await axios.get(`${API_URL}/invitations/${id}/guests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const guestIds = response.data.guests?.map((g: any) => g.recipient?._id || g.recipient).filter(Boolean) || [];
      setExistingGuestIds(guestIds);
    } catch (err) {
      console.log('Failed to fetch existing guests');
    }
  };

  // --- THE CONTACT GRABBER ---
  const loadDeviceContacts = async () => {
    setContactLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need access to your contacts to invite them.');
        setContactLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      if (data.length > 0) {
        // Filter out contacts without phone numbers and clean the formatting
        const validContacts = data
          .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
          .map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phoneNumbers![0].number?.replace(/\D/g, '') || '', // Strip non-digits
          }))
          .filter(c => c.phone.length > 5); // Basic check

        // Deduplicate
        const uniqueContacts = Array.from(new Map(validContacts.map(c => [c.phone, c])).values());
        
        setDeviceContacts(uniqueContacts.sort((a, b) => a.name.localeCompare(b.name)));
        setShowContactModal(true);
      } else {
        Alert.alert('No Contacts', 'No phone contacts found on this device.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load contacts');
    } finally {
      setContactLoading(false);
    }
  };

  const addPhoneContact = (contact: any) => {
    const tempId = `phone_${contact.phone}`;
    if (selectedUsers.some(u => u._id === tempId)) return;
    
    setSelectedUsers(prev => [...prev, {
      _id: tempId,
      name: contact.name,
      contactMethod: contact.phone,
      type: 'phone',
      salutation: 'None',
    }]);
    setShowContactModal(false);
  };

  const addManualInput = () => {
    const input = userSearch.trim();
    if (!input) return;

    const isEmail = input.includes('@');
    const isPhone = /^\d+$/.test(input.replace(/[\s\-\+\(\)]/g, ''));

    if (!isEmail && !isPhone) {
      Alert.alert('Error', 'Please enter a valid email or phone number');
      return;
    }

    const type = isEmail ? 'email' : 'phone';
    const cleanInput = isPhone ? input.replace(/\D/g, '') : input;
    const tempId = `${type}_${cleanInput}`;

    if (selectedUsers.some(u => u._id === tempId)) {
      setUserSearch('');
      return;
    }
    
    setSelectedUsers(prev => [...prev, {
      _id: tempId,
      name: input,
      contactMethod: cleanInput,
      type: type,
      salutation: 'None',
    }]);
    setUserSearch('');
  };

  const removeUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u._id !== userId));
  };

  // --- THE NATIVE HANDOFF ---
  const handleSendInvites = async () => {
    if (selectedUsers.length === 0) {
      Alert.alert('Error', 'Please add at least one guest.');
      return;
    }

    setInviting(true);

    try {
      const token = await AsyncStorage.getItem('authToken');
      const payload: any = { newEmails: [], newPhones: [] }; 
      const phoneNumbersToText: string[] = [];
      
      selectedUsers.forEach(user => {
        if (user.type === 'email') payload.newEmails.push(user.contactMethod);
        if (user.type === 'phone') {
            payload.newPhones.push({ name: user.name, phone: user.contactMethod });
            phoneNumbersToText.push(user.contactMethod);
        }
      });

      // 1. Register guests in the database
      await axios.post(`${API_URL}/invitations/${id}/share`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 2. THE FIX: Use a standard HTTPS URL so it becomes a clickable blue link in SMS
      // Note: You must configure your Render backend or Web Frontend to handle this route 
      // and redirect the user to hostapp://invitation/${id}
      const inviteLink = `https://invitoinbox.vercel.app/invite/${id}`;
      const messageBody = `You're invited to ${eventDetails?.title || 'my event'}! Click here to RSVP and see the details: ${inviteLink}`;

      // Stop the spinner BEFORE showing the alert so the UI feels responsive
      setInviting(false);

      // 3. Trigger the Native Delivery
      Alert.alert(
        'Database Updated',
        'Guests registered successfully. How would you like to send the links?',
        [
          {
            text: 'Send via SMS',
            onPress: async () => {
              if (phoneNumbersToText.length > 0) {
                const isAvailable = await SMS.isAvailableAsync();
                if (isAvailable) {
                  await SMS.sendSMSAsync(phoneNumbersToText, messageBody);
                  router.back();
                } else {
                  Alert.alert('Error', 'SMS is not available on this device');
                }
              } else {
                Alert.alert('Notice', 'No phone numbers selected for SMS.');
              }
            }
          },
          {
            text: 'Share via WhatsApp / Other',
            onPress: async () => {
              await Share.share({
                message: messageBody,
              });
              router.back();
            }
          },
          { text: 'Done', style: 'cancel', onPress: () => router.back() }
        ]
      );

    } catch (err: any) {
      setInviting(false); // Turn off spinner on error
      Alert.alert('Error', 'Failed to register guests in the database.');
    } 
    // Removed the 'finally' block because it executes prematurely during the Alert
  };

  if (loading || !authCheckComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Verifying Permissions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Send Invites', headerShown: false }} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backButton}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Guests</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        
        {/* Contact Grabber Button */}
        <TouchableOpacity 
          style={styles.contactGrabberBtn} 
          onPress={loadDeviceContacts}
          disabled={contactLoading}
        >
          {contactLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.contactGrabberText}>📱 Select from Phonebook</Text>}
        </TouchableOpacity>

        {/* Manual Search */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Or Add Manually</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Email or Phone Number..."
              placeholderTextColor={COLORS.textMuted}
              value={userSearch}
              onChangeText={setUserSearch}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.addEmailButton} onPress={addManualInput}>
              <Text style={styles.addEmailText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected List */}
        {selectedUsers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ready to Invite ({selectedUsers.length})</Text>
            {selectedUsers.map(user => (
              <View key={user._id} style={styles.selectedUserCard}>
                <View style={styles.selectedUserInfo}>
                  <Text style={styles.selectedUserName}>{user.name}</Text>
                  <Text style={styles.selectedUserEmail}>{user.contactMethod}</Text>
                </View>
                <TouchableOpacity style={styles.removeButton} onPress={() => removeUser(user._id)}>
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.sendButton, selectedUsers.length === 0 && styles.sendButtonDisabled]}
          onPress={handleSendInvites}
          disabled={inviting || selectedUsers.length === 0}
        >
          {inviting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendButtonText}>Generate Invites</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Phonebook Modal */}
      <Modal visible={showContactModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Phone Contacts</Text>
            <TouchableOpacity onPress={() => setShowContactModal(false)}>
              <Text style={{ color: COLORS.danger, fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={deviceContacts}
            keyExtractor={item => item.phone}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.contactRow} onPress={() => addPhoneContact(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.name}</Text>
                  <Text style={{ color: COLORS.textMuted, marginTop: 4 }}>{item.phone}</Text>
                </View>
                <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>+ Add</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: SPACING.sm, ...TYPOGRAPHY.body },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { fontSize: 24, color: COLORS.text, padding: SPACING.xs },
  headerTitle: { flex: 1, ...TYPOGRAPHY.header, textAlign: 'center' },
  headerSpacer: { width: 40 },
  scrollView: { flex: 1 },
  section: { padding: SPACING.md },
  sectionTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.sm },
  
  contactGrabberBtn: { backgroundColor: '#10B981', margin: SPACING.md, padding: SPACING.md, borderRadius: 12, alignItems: 'center', ...SHADOWS.card },
  contactGrabberText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  searchRow: { flexDirection: 'row', gap: SPACING.sm },
  searchInput: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, ...TYPOGRAPHY.body, borderWidth: 1, borderColor: COLORS.border },
  addEmailButton: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: SPACING.lg, justifyContent: 'center' },
  addEmailText: { color: '#FFFFFF', fontWeight: 'bold' },

  selectedUserCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.card },
  selectedUserInfo: { flex: 1 },
  selectedUserName: { ...TYPOGRAPHY.body, fontWeight: 'bold' },
  selectedUserEmail: { ...TYPOGRAPHY.small, color: COLORS.textMuted },
  removeButton: { backgroundColor: '#FEE2E2', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: COLORS.danger, fontWeight: 'bold' },

  contactRow: { flexDirection: 'row', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },

  sendButton: { backgroundColor: COLORS.primary, borderRadius: 12, padding: SPACING.md + 4, alignItems: 'center', margin: SPACING.md, marginTop: SPACING.xl },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
});