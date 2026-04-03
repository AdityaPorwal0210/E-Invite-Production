import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  _id: string; 
  name: string;
  contactMethod: string; 
  type: 'registered' | 'email' | 'phone';
  salutation: string;
}

const SALUTATION_OPTIONS = ['None', 'Mr.', 'Mrs.', 'Ms.', 'Mr. & Mrs.', 'With Family'];

export default function InviteScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  // State
  const [userSearch, setUserSearch] = useState<string>('');
  const [userResults, setUserResults] = useState<Array<{_id: string; name: string; email: string}>>([]);
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [existingGuestIds, setExistingGuestIds] = useState<string[]>([]);
  
  // Contacts State
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState(''); 

  // Security & UI State
  const [loading, setLoading] = useState<boolean>(true);
  const [inviting, setInviting] = useState<boolean>(false);
  const [authCheckComplete, setAuthCheckComplete] = useState<boolean>(false);
  const [eventDetails, setEventDetails] = useState<any>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- SECURITY VAULT ---
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

  // --- DATABASE SEARCH DEBOUNCE ---
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (userSearch.trim().length < 2) {
      setUserResults([]);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(userSearch);
    }, 300);
    
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [userSearch]);

  const searchUsers = async (query: string) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.get(`${API_URL}/users/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const selectedIds = selectedUsers.map(u => u._id);
      const filtered = response.data.filter((u: any) => !selectedIds.includes(u._id));
      setUserResults(filtered);
    } catch (err) {
      console.log('Failed to search users');
    }
  };

  // --- ADDING USERS ---
  const addUser = (user: { _id: string; name: string; email: string }) => {
    if (selectedUsers.some(u => u._id === user._id)) return;
    
    setSelectedUsers(prev => [...prev, {
      _id: user._id,
      name: user.name,
      contactMethod: user.email,
      type: 'registered',
      salutation: 'None',
    }]);
    setUserSearch('');
    setUserResults([]);
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
    setUserResults([]);
  };

  const removeUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u._id !== userId));
  };

  const updateUserSalutation = (userId: string, salutation: string) => {
    setSelectedUsers(prev => prev.map(u => 
      u._id === userId ? { ...u, salutation } : u
    ));
  };

  // --- THE CONTACT GRABBER ---
  const loadDeviceContacts = async () => {
    setContactLoading(true);
    setContactSearchQuery(''); 
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
        const validContacts = data
          .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
          .map(c => ({
            id: c.id,
            name: c.name || 'Unknown',
            phone: c.phoneNumbers![0].number?.replace(/\D/g, '') || '', 
          }))
          .filter(c => c.phone.length > 5); 

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
    if (selectedUsers.some(u => u._id === tempId)) {
      Alert.alert('Already Added', 'This contact is already in your invite list.');
      return;
    }
    
    setSelectedUsers(prev => [...prev, {
      _id: tempId,
      name: contact.name,
      contactMethod: contact.phone,
      type: 'phone',
      salutation: 'None',
    }]);
    setShowContactModal(false);
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
      const payload: any = { newEmails: [], newPhones: [], newUsers: [], salutations: {} }; 
      const phoneNumbersToText: string[] = [];
      
      selectedUsers.forEach(user => {
        const salutationKey = user.type === 'email' ? user.contactMethod : user.type === 'phone' ? user.contactMethod : user._id;

        if (user.type === 'email') payload.newEmails.push(user.contactMethod);
        if (user.type === 'phone') {
            payload.newPhones.push({ name: user.name, phone: user.contactMethod });
            phoneNumbersToText.push(user.contactMethod);
        }
        if (user.type === 'registered') {
            payload.newUsers.push(user._id);
        }

        if (user.salutation && user.salutation !== 'None') {
          payload.salutations[salutationKey] = user.salutation;
        }
      });

      await axios.post(`${API_URL}/invitations/${id}/share`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const inviteLink = `https://invitoinbox.vercel.app/invite/${id}`;
      const messageBody = `You're invited to ${eventDetails?.title || 'my event'}! Click here to RSVP and see the details: ${inviteLink}`;

      setInviting(false);

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
      setInviting(false);
      Alert.alert('Error', 'Failed to register guests in the database.');
    } 
  };

  const filteredContacts = deviceContacts.filter(contact => 
    contact.name.toLowerCase().includes(contactSearchQuery.toLowerCase()) || 
    contact.phone.includes(contactSearchQuery)
  );

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
        
        <TouchableOpacity 
          style={styles.contactGrabberBtn} 
          onPress={loadDeviceContacts}
          disabled={contactLoading}
        >
          {contactLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.contactGrabberText}>📱 Select from Phonebook</Text>}
        </TouchableOpacity>

        {/* Manual Search & Live Database Results */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search Users or Add Email/Phone</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Name, Email, or Phone..."
              placeholderTextColor={COLORS.textMuted}
              value={userSearch}
              onChangeText={setUserSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.addEmailButton} onPress={addManualInput}>
              <Text style={styles.addEmailText}>Add Raw</Text>
            </TouchableOpacity>
          </View>

          {/* THE FIX: Live Search Results Dropdown */}
          {userResults.length > 0 && (
            <View style={styles.searchResultsDropdown}>
              {userResults.map((user) => {
                const isAlreadyInvited = existingGuestIds.includes(user._id);
                const isQueued = selectedUsers.some(u => u._id === user._id);

                return (
                  <TouchableOpacity
                    key={user._id}
                    style={[
                      styles.searchResultItem,
                      (isAlreadyInvited || isQueued) && { opacity: 0.5 }
                    ]}
                    onPress={() => !isAlreadyInvited && !isQueued && addUser(user)}
                    disabled={isAlreadyInvited || isQueued}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...TYPOGRAPHY.body, fontWeight: 'bold' }}>{user.name}</Text>
                      <Text style={{ ...TYPOGRAPHY.small, color: COLORS.textMuted }}>{user.email}</Text>
                    </View>
                    
                    {isAlreadyInvited ? (
                      <Text style={{ color: COLORS.success, fontWeight: 'bold', fontSize: 12 }}>Invited</Text>
                    ) : isQueued ? (
                      <Text style={{ color: COLORS.primary, fontWeight: 'bold', fontSize: 12 }}>Added</Text>
                    ) : (
                      <Text style={{ color: COLORS.primary, fontWeight: 'bold', fontSize: 20 }}>+</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Selected List with Salutations */}
        {selectedUsers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ready to Invite ({selectedUsers.length})</Text>
            {selectedUsers.map(user => (
              <View key={user._id} style={styles.selectedUserCard}>
                <View style={styles.selectedUserHeader}>
                  <View style={styles.selectedUserInfo}>
                    <Text style={styles.selectedUserName}>{user.name}</Text>
                    <Text style={styles.selectedUserEmail}>{user.contactMethod}</Text>
                  </View>
                  <TouchableOpacity style={styles.removeButton} onPress={() => removeUser(user._id)}>
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* THE SALUTATION CHIPS */}
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.salutationScroll}
                  contentContainerStyle={styles.salutationChips}
                >
                  {SALUTATION_OPTIONS.map(option => {
                    const isSelected = option === 'None' 
                      ? user.salutation === '' || user.salutation === 'None'
                      : user.salutation === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.salutationChip,
                          isSelected && styles.salutationChipSelected
                        ]}
                        onPress={() => updateUserSalutation(user._id, option === 'None' ? '' : option)}
                      >
                        <Text style={[
                          styles.salutationText,
                          isSelected && styles.salutationTextSelected
                        ]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
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
              <Text style={{ color: COLORS.danger, fontWeight: 'bold', padding: SPACING.xs }}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalSearchBarContainer}>
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search by name or number..."
              placeholderTextColor={COLORS.textMuted}
              value={contactSearchQuery}
              onChangeText={setContactSearchQuery}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={filteredContacts}
            keyExtractor={item => item.phone}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.contactRow} onPress={() => addPhoneContact(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.name}</Text>
                  <Text style={{ color: COLORS.textMuted, marginTop: 4 }}>{item.phone}</Text>
                </View>
                <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>+ Add</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={{ padding: SPACING.xl, alignItems: 'center' }}>
                <Text style={{ color: COLORS.textMuted }}>No contacts match your search.</Text>
              </View>
            }
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

  searchResultsDropdown: { backgroundColor: COLORS.card, borderRadius: 12, marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...SHADOWS.card },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },

  selectedUserCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.card },
  selectedUserHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  selectedUserInfo: { flex: 1 },
  selectedUserName: { ...TYPOGRAPHY.body, fontWeight: 'bold' },
  selectedUserEmail: { ...TYPOGRAPHY.small, color: COLORS.textMuted },
  removeButton: { backgroundColor: '#FEE2E2', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: COLORS.danger, fontWeight: 'bold' },

  salutationScroll: { marginTop: SPACING.xs },
  salutationChips: { paddingVertical: SPACING.xs },
  salutationChip: { backgroundColor: COLORS.background, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12, marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  salutationChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  salutationText: { ...TYPOGRAPHY.small, fontWeight: '500' },
  salutationTextSelected: { color: '#FFFFFF' },

  modalSearchBarContainer: { padding: SPACING.md, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalSearchInput: { backgroundColor: COLORS.background, borderRadius: 8, padding: 12, ...TYPOGRAPHY.body, borderWidth: 1, borderColor: COLORS.border },
  contactRow: { flexDirection: 'row', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center', backgroundColor: COLORS.card },

  sendButton: { backgroundColor: COLORS.primary, borderRadius: 12, padding: SPACING.md + 4, alignItems: 'center', margin: SPACING.md, marginTop: SPACING.xl },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
});