import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';

const API_URL = 'https://invitoinbox.onrender.com/api';

interface Group {
  _id: string;
  name: string;
  description?: string;
  memberCount?: number;
}

interface SelectedUser {
  _id: string;
  name: string;
  email: string;
  salutation: string;
}

const SALUTATION_OPTIONS = ['None', 'Mr.', 'Mrs.', 'Ms.', 'Mr. & Mrs.', 'With Family'];

export default function InviteScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  // State
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState<string>('');
  const [userResults, setUserResults] = useState<Array<{_id: string; name: string; email: string}>>([]);
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [existingGuestIds, setExistingGuestIds] = useState<string[]>([]);
  
  // Security & UI State
  const [loading, setLoading] = useState<boolean>(true);
  const [inviting, setInviting] = useState<boolean>(false);
  const [authCheckComplete, setAuthCheckComplete] = useState<boolean>(false);
  
  // Debounce ref
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useFocusEffect(
    useCallback(() => {
      checkAuthAndVerifyHost();
    }, [id])
  );

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (userSearch.trim().length < 2) {
      setUserResults([]);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(userSearch);
    }, 300);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [userSearch]);

  const checkAuthAndVerifyHost = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');

      // 1. THE BOUNCER: Kick unauthenticated users
      if (!token) {
        console.log('🚨 Unauthenticated attempt to access Invite Screen. Redirecting...');
        setAuthCheckComplete(true);
        setLoading(false);
        await AsyncStorage.setItem('pendingRoute', `/invite/${id}`);
        router.replace('/');
        return;
      }

      // 2. Identify current user
      const userStr = await AsyncStorage.getItem('user');
      let currentId = null;
      if (userStr) {
        const userData = JSON.parse(userStr);
        currentId = userData._id || userData.id;
      }

      // 3. THE VAULT: Verify Host Status against the event
      const response = await axios.get(`${API_URL}/invitations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const ownerId = response.data.host?._id || response.data.user;
      
      if (currentId !== ownerId) {
        console.log('🛑 UNAUTHORIZED: User is not the host of this event.');
        Alert.alert('Unauthorized', 'You do not have permission to invite guests to this event.');
        router.replace(`/event/${id}`); // Kick them to the safe view
        return;
      }

      // 4. Authorized. Fetch the required data in parallel to save time.
      await Promise.all([
        fetchGroups(token),
        fetchExistingGuests(token)
      ]);

      setAuthCheckComplete(true);
    } catch (err: any) {
      console.error('❌ Security Check Failed:', err.message);
      Alert.alert('Error', 'Failed to load event details. It may have been deleted.');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async (token: string) => {
    try {
      const response = await axios.get(`${API_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroups(response.data || []);
    } catch (err) {
      console.log('Failed to fetch groups:', err);
    }
  };

  const fetchExistingGuests = async (token: string) => {
    try {
      const response = await axios.get(`${API_URL}/invitations/${id}/guests`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const guestIds = response.data.guests?.map((guest: any) => {
        if (guest.recipient && typeof guest.recipient === 'object') {
          return guest.recipient._id;
        }
        return guest.recipient;
      }).filter(Boolean) || [];

      setExistingGuestIds(guestIds);
    } catch (err) {
      console.log('Failed to fetch existing guests');
    }
  };

  const searchUsers = async (query: string) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.get(`${API_URL}/users/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Filter out already selected users
      const selectedIds = selectedUsers.map(u => u._id);
      const filtered = response.data.filter((u: any) => !selectedIds.includes(u._id));
      setUserResults(filtered);
    } catch (err) {
      console.log('Failed to search users');
    }
  };

  const toggleGroup = (groupId: string) => {
    if (selectedGroups.includes(groupId)) {
      setSelectedGroups(prev => prev.filter(id => id !== groupId));
    } else {
      setSelectedGroups(prev => [...prev, groupId]);
    }
  };

  const addUser = (user: { _id: string; name: string; email: string }) => {
    if (selectedUsers.some(u => u._id === user._id)) {
      return;
    }
    
    setSelectedUsers(prev => [...prev, {
      _id: user._id,
      name: user.name,
      email: user.email,
      salutation: '',
    }]);
    setUserSearch('');
    setUserResults([]);
  };

  const addEmailAsUser = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userSearch.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    
    const tempId = `email_${Date.now()}`;
    setSelectedUsers(prev => [...prev, {
      _id: tempId,
      name: userSearch.trim(),
      email: userSearch.trim(),
      salutation: '',
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

  const handleSendInvites = async () => {
    if (selectedGroups.length === 0 && selectedUsers.length === 0) {
      Alert.alert('Error', 'Please select at least one group or user to invite');
      return;
    }

    setInviting(true);

    try {
      const token = await AsyncStorage.getItem('authToken');
      
      const finalUserIds: string[] = [];
      const emailOnlyGuests: string[] = [];
      const salutationsMap: Record<string, string> = {};
      
      selectedUsers.forEach(user => {
        if (user._id.startsWith('email_')) {
          emailOnlyGuests.push(user.email);
          if (user.salutation && user.salutation !== 'None') {
            salutationsMap[user.email] = user.salutation;
          }
        } else {
          finalUserIds.push(user._id);
          if (user.salutation && user.salutation !== 'None') {
            salutationsMap[user._id] = user.salutation;
          }
        }
      });

      const payload: any = {
        newGroups: selectedGroups,
      };

      if (finalUserIds.length > 0) {
        payload.newUsers = finalUserIds;
      }

      if (emailOnlyGuests.length > 0) {
        payload.newEmails = emailOnlyGuests;
      }

      if (Object.keys(salutationsMap).length > 0) {
        payload.salutations = salutationsMap;
      }

      await axios.post(`${API_URL}/invitations/${id}/share`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      Alert.alert('Success', 'Invitations sent successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to send invitations';
      Alert.alert('Error', errorMessage);
    } finally {
      setInviting(false);
    }
  };

  // --- RENDERING GUARDS ---
  if (loading || !authCheckComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Send Invites', headerShown: false }} />
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
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send Invites</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Section 1: Groups */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Groups</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupsContainer}
          >
            {groups.map(group => {
              const isSelected = selectedGroups.includes(group._id);
              return (
                <TouchableOpacity
                  key={group._id}
                  style={[
                    styles.groupChip,
                    isSelected && styles.groupChipSelected
                  ]}
                  onPress={() => toggleGroup(group._id)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.groupChipText,
                    isSelected && styles.groupChipTextSelected
                  ]}>{group.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Section 2: Individual Search */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite Individuals</Text>
          
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={COLORS.textMuted}
              value={userSearch}
              onChangeText={setUserSearch}
            />
            {userSearch.includes('@') && (
              <TouchableOpacity
                style={styles.addEmailButton}
                onPress={addEmailAsUser}
              >
                <Text style={styles.addEmailText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Search Results */}
          {userResults.length > 0 && (
            <View style={styles.searchResults}>
              {userResults.map(user => {
                const isAlreadyInvited = existingGuestIds.includes(user._id);
                const isQueued = selectedUsers.some(u => u._id === user._id);
                
                return (
                  <TouchableOpacity
                    key={user._id}
                    style={[
                      styles.searchResultItem,
                      (isAlreadyInvited || isQueued) && styles.searchResultItemDisabled
                    ]}
                    onPress={() => !isAlreadyInvited && !isQueued && addUser(user)}
                    disabled={isAlreadyInvited || isQueued}
                  >
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultName}>{user.name}</Text>
                      <Text style={styles.searchResultEmail}>{user.email}</Text>
                    </View>
                    {isAlreadyInvited ? (
                      <View style={styles.alreadyInvitedBadge}>
                        <Text style={styles.alreadyInvitedText}>Already Invited</Text>
                      </View>
                    ) : isQueued ? (
                      <View style={styles.addedBadge}>
                        <Text style={styles.addedText}>Added</Text>
                      </View>
                    ) : (
                      <Text style={styles.addIcon}>+</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Section 3: Selected Users & Salutations */}
        {selectedUsers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Selected ({selectedUsers.length})</Text>
            
            {selectedUsers.map(user => (
              <View key={user._id} style={styles.selectedUserCard}>
                <View style={styles.selectedUserHeader}>
                  <View style={styles.selectedUserInfo}>
                    <Text style={styles.selectedUserName}>{user.name}</Text>
                    <Text style={styles.selectedUserEmail}>{user.email}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeUser(user._id)}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
                
                {/* Salutation Chips */}
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

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.sendButton, inviting && styles.sendButtonDisabled]}
          onPress={handleSendInvites}
          disabled={inviting}
          activeOpacity={0.8}
        >
          {inviting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.sendButtonText}>Send Invites</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.sm,
    ...TYPOGRAPHY.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    fontSize: 24,
    color: COLORS.text,
    padding: SPACING.xs,
  },
  headerTitle: {
    flex: 1,
    ...TYPOGRAPHY.header,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.header,
    marginBottom: SPACING.md,
  },
  // Groups styles
  groupsContainer: {
    paddingVertical: SPACING.xs,
  },
  groupChip: {
    backgroundColor: COLORS.card,
    borderRadius: 100,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  groupChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  groupChipText: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
  },
  groupChipTextSelected: {
    color: '#FFFFFF',
  },
  // Search styles
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addEmailButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  addEmailText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  searchResults: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchResultItemDisabled: {
    opacity: 0.5,
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
  },
  searchResultEmail: {
    ...TYPOGRAPHY.small,
    marginTop: 2,
  },
  addIcon: {
    fontSize: 20,
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  alreadyInvitedBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  alreadyInvitedText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  addedBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  addedText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // Selected user styles
  selectedUserCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  selectedUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  selectedUserInfo: {
    flex: 1,
  },
  selectedUserName: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
  },
  selectedUserEmail: {
    ...TYPOGRAPHY.small,
  },
  removeButton: {
    backgroundColor: '#FEE2E2',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: COLORS.danger,
    fontWeight: 'bold',
    fontSize: 14,
  },
  salutationScroll: {
    marginTop: SPACING.xs,
  },
  salutationChips: {
    paddingVertical: SPACING.xs,
  },
  salutationChip: {
    backgroundColor: COLORS.background,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  salutationChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  salutationText: {
    ...TYPOGRAPHY.small,
    fontWeight: '500',
  },
  salutationTextSelected: {
    color: '#FFFFFF',
  },
  // Send button
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md + 2,
    alignItems: 'center',
    margin: SPACING.md,
    marginTop: SPACING.lg,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});