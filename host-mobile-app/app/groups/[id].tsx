import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

// --- Types ---
interface User {
  _id: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  isRegistered: boolean;
}

interface Group {
  _id: string;
  name: string;
  description?: string;
  owner: User;
  admins: User[];
  members: User[];
}

interface PendingContact {
  id: string; // temporary local id
  name: string;
  phoneNumber: string;
  email: string;
}

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'roster' | 'add'>('roster');

  // --- Add Member Form State ---
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [pendingQueue, setPendingQueue] = useState<PendingContact[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchGroupDetails = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        setCurrentUserId(JSON.parse(userStr)._id);
      }

      const response = await axios.get(`${API_URL}/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setGroup(response.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load group');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  // --- Bulk Add Logic ---
  const addToQueue = () => {
    if (!newName.trim()) {
      return Alert.alert('Missing Info', 'Please enter a name.');
    }
    if (!newPhone.trim() && !newEmail.trim()) {
      return Alert.alert('Missing Info', 'Please enter either a phone number or email.');
    }

    const newContact: PendingContact = {
      id: Date.now().toString(),
      name: newName.trim(),
      phoneNumber: newPhone.trim(),
      email: newEmail.trim().toLowerCase(),
    };

    setPendingQueue([newContact, ...pendingQueue]);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
  };

  const removeFromQueue = (queueId: string) => {
    setPendingQueue(pendingQueue.filter(c => c.id !== queueId));
  };

  const submitBulkAdd = async () => {
    if (pendingQueue.length === 0) return;

    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      
      // Clean up the data to match backend expectations
      const contactsToSubmit = pendingQueue.map(c => ({
        name: c.name,
        phoneNumber: c.phoneNumber || undefined,
        email: c.email || undefined
      }));

      await axios.post(
        `${API_URL}/groups/${id}/members/bulk`,
        { contacts: contactsToSubmit },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert('Success', `Added ${pendingQueue.length} members to the group!`);
      setPendingQueue([]);
      setActiveTab('roster');
      fetchGroupDetails(); // Refresh the list
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to add members');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render Helpers ---
  const renderMember = ({ item }: { item: User }) => {
    const isOwner = group?.owner._id === item._id;
    const isAdmin = group?.admins.some(admin => admin._id === item._id);

    return (
      <View style={styles.memberCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name} {!item.isRegistered && '(Invite Pending)'}</Text>
          {item.phoneNumber ? <Text style={styles.memberContact}>{item.phoneNumber}</Text> : null}
          {item.email ? <Text style={styles.memberContact}>{item.email}</Text> : null}
        </View>
        <View style={styles.roleBadgeContainer}>
          {isOwner ? (
            <Text style={[styles.roleBadge, { backgroundColor: '#FEE2E2', color: '#991B1B' }]}>Owner</Text>
          ) : isAdmin ? (
            <Text style={[styles.roleBadge, { backgroundColor: '#FEF3C7', color: '#92400E' }]}>Admin</Text>
          ) : null}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !group) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: COLORS.danger }}>{error || 'Group not found'}</Text>
        <TouchableOpacity style={styles.button} onPress={fetchGroupDetails}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCurrentUserAdmin = group.owner._id === currentUserId || group.admins.some(a => a._id === currentUserId);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: group.name, headerBackTitle: 'Groups' }} />
      
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header Details */}
        <View style={styles.header}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.memberCount}>{group.members.length} Members</Text>
        </View>

        {/* Custom Tabs */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.pillButton, activeTab === 'roster' && styles.pillButtonActive]}
            onPress={() => setActiveTab('roster')}
          >
            <Text style={[styles.pillButtonText, activeTab === 'roster' && styles.pillButtonTextActive]}>
              Roster
            </Text>
          </TouchableOpacity>
          
          {isCurrentUserAdmin && (
            <TouchableOpacity
              style={[styles.pillButton, activeTab === 'add' && styles.pillButtonActive]}
              onPress={() => setActiveTab('add')}
            >
              <Text style={[styles.pillButtonText, activeTab === 'add' && styles.pillButtonTextActive]}>
                Add Members
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* TAB 1: Roster */}
        {activeTab === 'roster' ? (
          <FlatList
            data={group.members}
            keyExtractor={(item) => item._id}
            renderItem={renderMember}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          /* TAB 2: Add Members */
          <ScrollView contentContainerStyle={styles.addContent}>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Manually Add Contact</Text>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={newName}
                onChangeText={setNewName}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone Number (e.g. 1234567890)"
                keyboardType="phone-pad"
                value={newPhone}
                onChangeText={setNewPhone}
              />
              <TextInput
                style={styles.input}
                placeholder="Email (Optional if phone provided)"
                keyboardType="email-address"
                autoCapitalize="none"
                value={newEmail}
                onChangeText={setNewEmail}
              />
              <TouchableOpacity style={styles.outlineButton} onPress={addToQueue}>
                <Text style={styles.outlineButtonText}>+ Add to Queue</Text>
              </TouchableOpacity>
            </View>

            {/* Pending Queue */}
            {pendingQueue.length > 0 && (
              <View style={styles.queueContainer}>
                <Text style={styles.queueTitle}>Pending Queue ({pendingQueue.length})</Text>
                {pendingQueue.map(contact => (
                  <View key={contact.id} style={styles.queueItem}>
                    <View>
                      <Text style={styles.queueName}>{contact.name}</Text>
                      <Text style={styles.queueDetails}>{contact.phoneNumber || contact.email}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeFromQueue(contact.id)}>
                      <Text style={styles.removeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity 
                  style={styles.primaryButton} 
                  onPress={submitBulkAdd}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Save Members to Group</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: SPACING.lg, backgroundColor: COLORS.card, ...SHADOWS.small, marginBottom: SPACING.sm },
  groupName: { ...TYPOGRAPHY.title, fontSize: 24 },
  memberCount: { ...TYPOGRAPHY.bodyMuted, marginTop: 4 },
  toggleRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: SPACING.sm },
  pillButton: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, marginHorizontal: 5 },
  pillButtonActive: { backgroundColor: COLORS.primary },
  pillButtonText: { ...TYPOGRAPHY.body, color: COLORS.textMuted, fontWeight: '600' },
  pillButtonTextActive: { color: COLORS.card },
  listContent: { padding: SPACING.md },
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: SPACING.md, borderRadius: 12, marginBottom: SPACING.sm, ...SHADOWS.card },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  avatarText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 18 },
  memberInfo: { flex: 1 },
  memberName: { ...TYPOGRAPHY.body, fontWeight: 'bold' },
  memberContact: { ...TYPOGRAPHY.small, color: COLORS.textMuted },
  roleBadgeContainer: { marginLeft: SPACING.sm },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },
  addContent: { padding: SPACING.md },
  formCard: { backgroundColor: COLORS.card, padding: SPACING.lg, borderRadius: 12, ...SHADOWS.card, marginBottom: SPACING.lg },
  formTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.md },
  input: { backgroundColor: COLORS.background, borderRadius: 8, padding: 12, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  outlineButton: { borderWidth: 1, borderColor: COLORS.primary, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: SPACING.sm },
  outlineButtonText: { color: COLORS.primary, fontWeight: 'bold' },
  queueContainer: { paddingBottom: 40 },
  queueTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.sm },
  queueItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, padding: 12, borderRadius: 8, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  queueName: { fontWeight: 'bold', color: COLORS.text },
  queueDetails: { fontSize: 12, color: COLORS.textMuted },
  removeText: { fontSize: 18, color: COLORS.danger, paddingHorizontal: 10 },
  primaryButton: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 8, alignItems: 'center', marginTop: SPACING.lg },
  primaryButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  button: { marginTop: 20, backgroundColor: COLORS.primary, padding: 10, borderRadius: 8 },
  buttonText: { color: '#FFF' }
});