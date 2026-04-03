import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

interface Group {
  _id: string;
  name: string;
  description?: string;
  members?: Array<{
    _id: string;
    name: string;
    email?: string;
    phoneNumber?: string;
    isRegistered?: boolean;
  }>;
  owner?: {
    _id: string;
    name: string;
  };
  admins?: Array<{
    _id: string;
    name: string;
  }>;
  joinRequests?: Array<{
    _id: string;
    name: string;
    email: string;
  }>;
  joinSetting?: string;
}

interface PendingContact {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
}

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState<boolean>(false);
  
  // Manage modal state
  const [showManageModal, setShowManageModal] = useState<boolean>(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Add Members State (Dual Mode)
  const [addMode, setAddMode] = useState<'search' | 'manual'>('search');
  
  // Mode 1: Search Existing
  const [userSearch, setUserSearch] = useState<string>('');
  const [userResults, setUserResults] = useState<Array<{_id: string; name: string; email: string}>>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mode 2: Bulk Manual Add
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [pendingQueue, setPendingQueue] = useState<PendingContact[]>([]);
  const [submittingBulk, setSubmittingBulk] = useState(false);

  useEffect(() => {
    fetchGroups();
    fetchCurrentUser();
  }, []);
  
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (!showManageModal || userSearch.trim().length < 2 || addMode !== 'search') {
      setUserResults([]);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(userSearch);
    }, 300);
    
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [userSearch, showManageModal, addMode]);
  
  const fetchCurrentUser = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        setCurrentUserId(userData._id || userData.id);
      }
    } catch (e) {
      console.log('Failed to get current user');
    }
  };

  const fetchGroups = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return Alert.alert('Error', 'Please log in again');

      const response = await axios.get(`${API_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroups(response.data || []);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to fetch groups');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) return Alert.alert('Error', 'Please enter a group name');
    setCreating(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      await axios.post(
        `${API_URL}/groups`,
        { name: newGroup.name.trim(), description: newGroup.description.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert('Success', 'Group created successfully!');
      setShowCreateModal(false);
      setNewGroup({ name: '', description: '' });
      fetchGroups();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };
  
  const openManageModal = (group: Group) => {
    setSelectedGroup(group);
    // Reset all add states
    setAddMode('search');
    setUserSearch('');
    setUserResults([]);
    setPendingQueue([]);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setShowManageModal(true);
  };
  
  const refreshSelectedGroup = async () => {
    if (!selectedGroup) return;
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.get(`${API_URL}/groups/${selectedGroup._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedGroup(response.data);
      setGroups(prev => prev.map(g => g._id === selectedGroup._id ? response.data : g));
    } catch (err) {
      console.log('Failed to refresh group data');
    }
  };
  
const handleCopyInviteLink = async () => {
    if (!selectedGroup) return;
    
    // Using the exact double-'n' Vercel URL
    const WEB_APP_URL = 'https://invitoinnbox.vercel.app'; 
    
    try {
      await Share.share({
        message: `Join my group on InvitoInbox: ${WEB_APP_URL}/group/invite/${selectedGroup._id}`,
      });
    } catch (error) {
      console.log('Failed to share invite link');
    }
  };
  
  const handleToggleAdmin = async (memberId: string) => {
    if (!selectedGroup) return;
    try {
      const token = await AsyncStorage.getItem('authToken');
      await axios.put(
        `${API_URL}/groups/${selectedGroup._id}/admins`,
        { userId: memberId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      refreshSelectedGroup();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update admin');
    }
  };
  
  const handleJoinSettingChange = async (newSetting: string) => {
    if (!selectedGroup) return;
    try {
      const token = await AsyncStorage.getItem('authToken');
      await axios.put(
        `${API_URL}/groups/${selectedGroup._id}/settings`,
        { joinSetting: newSetting },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      refreshSelectedGroup();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update setting');
    }
  };
  
  const handleApproveRequest = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      const token = await AsyncStorage.getItem('authToken');
      await axios.put(
        `${API_URL}/groups/${selectedGroup._id}/requests/handle`,
        { userId, status: 'approve' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      refreshSelectedGroup();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to approve request');
    }
  };
  
  const handleRejectRequest = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      const token = await AsyncStorage.getItem('authToken');
      await axios.put(
        `${API_URL}/groups/${selectedGroup._id}/requests/handle`,
        { userId, status: 'reject' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      refreshSelectedGroup();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to reject request');
    }
  };
  
  const searchUsers = async (query: string) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.get(`${API_URL}/users/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const currentMemberIds = selectedGroup?.members?.map(m => m._id) || [];
      const filtered = response.data.filter((u: any) => u._id !== currentUserId && !currentMemberIds.includes(u._id));
      setUserResults(filtered);
    } catch (err) {
      console.log('Failed to search users');
    }
  };
  
  const handleAddMember = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      const token = await AsyncStorage.getItem('authToken');
      await axios.put(
        `${API_URL}/groups/${selectedGroup._id}/members`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUserSearch('');
      setUserResults([]);
      refreshSelectedGroup();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to add member');
    }
  };

  // --- NEW: Bulk Manual Add Logic ---
  const handleAddToQueue = () => {
    if (!newName.trim()) return Alert.alert('Wait', 'Please enter a name.');
    if (!newPhone.trim() && !newEmail.trim()) {
      return Alert.alert('Wait', 'Please enter either a phone number or email.');
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

  const handleRemoveFromQueue = (queueId: string) => {
    setPendingQueue(pendingQueue.filter(c => c.id !== queueId));
  };

  const handleSubmitBulkAdd = async () => {
    if (!selectedGroup || pendingQueue.length === 0) return;
    setSubmittingBulk(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const contactsToSubmit = pendingQueue.map(c => ({
        name: c.name,
        phoneNumber: c.phoneNumber || undefined,
        email: c.email || undefined
      }));

      await axios.post(
        `${API_URL}/groups/${selectedGroup._id}/members/bulk`,
        { contacts: contactsToSubmit },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert('Success', `Added ${pendingQueue.length} members!`);
      setPendingQueue([]);
      refreshSelectedGroup();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to add contacts.');
    } finally {
      setSubmittingBulk(false);
    }
  };
  // -----------------------------------
  
  const handleRemoveMember = async (memberId: string) => {
    if (!selectedGroup) return;
    Alert.alert('Remove Member', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('authToken');
            await axios.delete(
              `${API_URL}/groups/${selectedGroup._id}/members`,
              { data: { userId: memberId }, headers: { Authorization: `Bearer ${token}` } }
            );
            refreshSelectedGroup();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Failed to remove member');
          }
        },
      },
    ]);
  };

  const renderGroupCard = ({ item }: { item: Group }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={styles.memberBadge}>
          <Text style={styles.memberBadgeText}>{item.members?.length || 0} members</Text>
        </View>
      </View>
      <Text style={styles.cardDescription}>{item.description || 'No description'}</Text>
      <Text style={styles.cardOwner}>Owner: {item.owner?.name || 'Unknown'}</Text>
      <TouchableOpacity style={styles.manageButton} onPress={() => openManageModal(item)} activeOpacity={0.7}>
        <Text style={styles.manageButtonText}>Manage</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading groups...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isCurrentUserAdmin = selectedGroup?.owner?._id === currentUserId || selectedGroup?.admins?.some(a => a._id === currentUserId);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Groups</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)} activeOpacity={0.7}>
          <Text style={styles.createButtonText}>+ Create New Group</Text>
        </TouchableOpacity>
      </View>

      {/* Groups List */}
      {groups.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No groups yet.</Text>
          <Text style={styles.emptySubtitle}>Build your crew!</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item._id}
          renderItem={renderGroupCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent={true} onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Group</Text>
            <Text style={styles.inputLabel}>Group Name</Text>
            <TextInput style={styles.input} placeholder="Enter group name" placeholderTextColor={COLORS.textMuted} value={newGroup.name} onChangeText={(text) => setNewGroup({ ...newGroup, name: text })} />
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput style={[styles.input, styles.textArea]} placeholder="Enter description (optional)" placeholderTextColor={COLORS.textMuted} value={newGroup.description} onChangeText={(text) => setNewGroup({ ...newGroup, description: text })} multiline numberOfLines={3} textAlignVertical="top" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowCreateModal(false); setNewGroup({ name: '', description: '' }); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitButton, creating && styles.submitButtonDisabled]} onPress={handleCreateGroup} disabled={creating}>
                {creating ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.submitButtonText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manage Members Modal */}
      <Modal visible={showManageModal} animationType="slide" transparent={true} onRequestClose={() => setShowManageModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.manageModalContent]}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>Manage Group</Text>
              <TouchableOpacity onPress={() => setShowManageModal(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.manageSubtitle}>{selectedGroup?.name}</Text>
            
            <ScrollView style={styles.manageScrollView} showsVerticalScrollIndicator={false}>
              {/* Admin Tools Section */}
              {isCurrentUserAdmin && (
                <View style={styles.adminToolsSection}>
                  <Text style={styles.sectionLabel}>Admin Tools</Text>
                  <TouchableOpacity style={styles.shareLinkButton} onPress={handleCopyInviteLink}>
                    <Text style={styles.shareLinkText}>📋 Copy Invite Link</Text>
                  </TouchableOpacity>
                  <Text style={styles.smallLabel}>Join Setting:</Text>
                  <View style={styles.joinSettingRow}>
                    <TouchableOpacity style={[styles.joinSettingButton, selectedGroup?.joinSetting === 'invite_only' && styles.joinSettingActive]} onPress={() => handleJoinSettingChange('invite_only')}>
                      <Text style={[styles.joinSettingText, selectedGroup?.joinSetting === 'invite_only' && styles.joinSettingTextActive]}>Invite Only</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.joinSettingButton, selectedGroup?.joinSetting === 'request_to_join' && styles.joinSettingActive]} onPress={() => handleJoinSettingChange('request_to_join')}>
                      <Text style={[styles.joinSettingText, selectedGroup?.joinSetting === 'request_to_join' && styles.joinSettingTextActive]}>Request to Join</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              
              {/* Pending Requests Section */}
              {selectedGroup?.joinRequests && selectedGroup.joinRequests.length > 0 && (
                <View style={styles.requestsSection}>
                  <Text style={styles.sectionLabel}>Pending Requests ({selectedGroup.joinRequests.length})</Text>
                  {selectedGroup.joinRequests.map((request) => (
                    <View key={request._id} style={styles.requestItem}>
                      <View style={styles.requestInfo}>
                        <Text style={styles.requestName}>{request.name}</Text>
                        <Text style={styles.requestEmail}>{request.email}</Text>
                      </View>
                      <View style={styles.requestActions}>
                        <TouchableOpacity style={styles.approveButton} onPress={() => handleApproveRequest(request._id)}>
                          <Text style={styles.approveButtonText}>✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.rejectButton} onPress={() => handleRejectRequest(request._id)}>
                          <Text style={styles.rejectButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              
              {/* --- ADD MEMBERS SECTION --- */}
              {isCurrentUserAdmin && (
                <View style={styles.addMembersContainer}>
                  <Text style={styles.sectionLabel}>Add Members</Text>
                  
                  {/* Mode Toggles */}
                  <View style={styles.addModeToggle}>
                    <TouchableOpacity 
                      style={[styles.addModeButton, addMode === 'search' && styles.addModeActive]}
                      onPress={() => setAddMode('search')}
                    >
                      <Text style={[styles.addModeText, addMode === 'search' && styles.addModeTextActive]}>Search App</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.addModeButton, addMode === 'manual' && styles.addModeActive]}
                      onPress={() => setAddMode('manual')}
                    >
                      <Text style={[styles.addModeText, addMode === 'manual' && styles.addModeTextActive]}>Add via Contact</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Mode 1: Search */}
                  {addMode === 'search' ? (
                    <View>
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search by name or email..."
                        placeholderTextColor={COLORS.textMuted}
                        value={userSearch}
                        onChangeText={setUserSearch}
                      />
                      {userResults.length > 0 && (
                        <View style={styles.searchResults}>
                          {userResults.map((user) => (
                            <View key={user._id} style={styles.searchResultItem}>
                              <View style={styles.searchResultInfo}>
                                <Text style={styles.searchResultName}>{user.name}</Text>
                                <Text style={styles.searchResultEmail}>{user.email}</Text>
                              </View>
                              <TouchableOpacity style={styles.addButton} onPress={() => handleAddMember(user._id)}>
                                <Text style={styles.addButtonText}>Add</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ) : (
                    /* Mode 2: Manual Contacts (Bulk Add) */
                    <View style={styles.manualAddContainer}>
                      <TextInput style={styles.manualInput} placeholder="Full Name" value={newName} onChangeText={setNewName} />
                      <TextInput style={styles.manualInput} placeholder="Phone Number (e.g. 1234567890)" keyboardType="phone-pad" value={newPhone} onChangeText={setNewPhone} />
                      <TextInput style={styles.manualInput} placeholder="Email (Optional)" keyboardType="email-address" autoCapitalize="none" value={newEmail} onChangeText={setNewEmail} />
                      
                      <TouchableOpacity style={styles.queueButton} onPress={handleAddToQueue}>
                        <Text style={styles.queueButtonText}>+ Add to Queue</Text>
                      </TouchableOpacity>

                      {pendingQueue.length > 0 && (
                        <View style={styles.queueList}>
                          <Text style={styles.smallLabel}>Pending ({pendingQueue.length})</Text>
                          {pendingQueue.map(contact => (
                            <View key={contact.id} style={styles.queueItem}>
                              <View>
                                <Text style={styles.queueItemName}>{contact.name}</Text>
                                <Text style={styles.queueItemContact}>{contact.phoneNumber || contact.email}</Text>
                              </View>
                              <TouchableOpacity onPress={() => handleRemoveFromQueue(contact.id)}>
                                <Text style={styles.removeText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                          <TouchableOpacity style={styles.submitBulkButton} onPress={handleSubmitBulkAdd} disabled={submittingBulk}>
                            {submittingBulk ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBulkButtonText}>Save to Group</Text>}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
              {/* --- END ADD MEMBERS SECTION --- */}
              
              {/* Current Members List */}
              <Text style={styles.sectionLabel}>Current Members ({selectedGroup?.members?.length || 0})</Text>
              {selectedGroup?.members?.map((member) => {
                const isAdmin = selectedGroup.admins?.some(a => a._id === member._id);
                const isOwner = member._id === selectedGroup.owner?._id;
                
                return (
                  <View key={member._id} style={styles.memberItem}>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.name} {member.isRegistered === false && <Text style={{fontSize: 10, color: COLORS.textMuted}}>(Pending)</Text>}</Text>
                      <Text style={styles.memberEmail}>{member.phoneNumber || member.email || 'No contact info'}</Text>
                      <View style={styles.memberBadges}>
                        {isOwner && <View style={styles.ownerBadge}><Text style={styles.ownerBadgeText}>Owner</Text></View>}
                        {isAdmin && !isOwner && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>}
                      </View>
                    </View>
                    {!isOwner && (
                      <View style={styles.memberActions}>
                        {isCurrentUserAdmin && (
                          <TouchableOpacity style={[styles.adminToggleButton, isAdmin && styles.adminToggleActive]} onPress={() => handleToggleAdmin(member._id)}>
                            <Text style={[styles.adminToggleText, isAdmin && styles.adminToggleTextActive]}>{isAdmin ? '★' : '☆'}</Text>
                          </TouchableOpacity>
                        )}
                        {isCurrentUserAdmin && (
                          <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveMember(member._id)}>
                            <Text style={styles.removeButtonText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.screenPadding },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: SPACING.sm, ...TYPOGRAPHY.body },
  header: { backgroundColor: COLORS.card, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { ...TYPOGRAPHY.title, marginBottom: SPACING.md },
  createButton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: SPACING.sm + 4, alignItems: 'center' },
  createButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  listContent: { paddingVertical: SPACING.md },
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  cardTitle: { ...TYPOGRAPHY.header, flex: 1 },
  memberBadge: { backgroundColor: COLORS.primaryLight, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 100 },
  memberBadgeText: { ...TYPOGRAPHY.small, color: COLORS.primary, fontWeight: '600' },
  cardDescription: { ...TYPOGRAPHY.small, marginBottom: SPACING.sm, lineHeight: 18 },
  cardOwner: { ...TYPOGRAPHY.small, marginBottom: SPACING.md },
  manageButton: { backgroundColor: COLORS.primaryLight, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start' },
  manageButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.md },
  emptyTitle: { ...TYPOGRAPHY.title, marginBottom: SPACING.sm },
  emptySubtitle: { ...TYPOGRAPHY.body, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
  modalContent: { backgroundColor: COLORS.card, borderRadius: 16, padding: SPACING.lg, width: '95%', maxHeight: '85%', ...SHADOWS.card },
  modalTitle: { ...TYPOGRAPHY.title, textAlign: 'center', marginBottom: SPACING.lg },
  inputLabel: { ...TYPOGRAPHY.body, fontWeight: '600', marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.background, borderRadius: 8, padding: SPACING.md, ...TYPOGRAPHY.body, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  textArea: { height: 100, paddingTop: SPACING.md },
  modalButtons: { flexDirection: 'row', marginTop: SPACING.sm },
  cancelButton: { flex: 1, backgroundColor: COLORS.border, borderRadius: 8, paddingVertical: SPACING.sm + 4, alignItems: 'center', marginRight: SPACING.xs },
  cancelButtonText: { color: COLORS.text, fontWeight: 'bold', fontSize: 14 },
  submitButton: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: SPACING.sm + 4, alignItems: 'center', marginLeft: SPACING.xs },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  manageModalContent: { maxHeight: '90%' },
  manageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  manageTitle: { ...TYPOGRAPHY.title },
  manageSubtitle: { ...TYPOGRAPHY.bodyMuted, marginBottom: SPACING.md },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { ...TYPOGRAPHY.body, fontWeight: '600' },
  manageScrollView: { maxHeight: 500 },
  sectionLabel: { ...TYPOGRAPHY.header, marginBottom: SPACING.sm, marginTop: SPACING.sm },
  addMembersContainer: { backgroundColor: '#F9FAFB', padding: SPACING.sm, borderRadius: 8, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  addModeToggle: { flexDirection: 'row', marginBottom: SPACING.sm, backgroundColor: COLORS.background, borderRadius: 8, padding: 4 },
  addModeButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  addModeActive: { backgroundColor: COLORS.primary },
  addModeText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  addModeTextActive: { color: '#FFF' },
  manualAddContainer: { marginTop: 4 },
  manualInput: { backgroundColor: COLORS.background, borderRadius: 6, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 14 },
  queueButton: { borderWidth: 1, borderColor: COLORS.primary, padding: 10, borderRadius: 6, alignItems: 'center', marginBottom: 8 },
  queueButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 14 },
  queueList: { marginTop: 8, backgroundColor: '#FFF', borderRadius: 6, padding: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  queueItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  queueItemName: { fontWeight: 'bold', fontSize: 14, color: COLORS.text },
  queueItemContact: { fontSize: 12, color: COLORS.textMuted },
  submitBulkButton: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  submitBulkButtonText: { color: '#FFF', fontWeight: 'bold' },
  searchInput: { backgroundColor: COLORS.background, borderRadius: 8, padding: SPACING.sm + 6, ...TYPOGRAPHY.body, borderWidth: 1, borderColor: COLORS.border },
  searchResults: { marginTop: SPACING.sm, marginBottom: SPACING.md },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.background, borderRadius: 8, padding: SPACING.sm + 4, marginBottom: SPACING.xs + 4 },
  searchResultInfo: { flex: 1 },
  searchResultName: { ...TYPOGRAPHY.body, fontWeight: '600' },
  searchResultEmail: { ...TYPOGRAPHY.small },
  addButton: { backgroundColor: COLORS.success, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 4, borderRadius: 8 },
  addButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  memberItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 8, padding: SPACING.sm + 4, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  memberInfo: { flex: 1 },
  memberName: { ...TYPOGRAPHY.body, fontWeight: '600' },
  memberEmail: { ...TYPOGRAPHY.small },
  ownerBadge: { backgroundColor: '#EDE9FE', paddingHorizontal: SPACING.xs + 4, paddingVertical: 2, borderRadius: 4, marginTop: SPACING.xs, alignSelf: 'flex-start' },
  ownerBadgeText: { ...TYPOGRAPHY.small, color: '#7C3AED', fontWeight: '600' },
  removeButton: { backgroundColor: COLORS.dangerLight, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: COLORS.danger, fontWeight: 'bold', fontSize: 16 },
  adminToolsSection: { backgroundColor: COLORS.background, borderRadius: 8, padding: SPACING.md, marginBottom: SPACING.md },
  shareLinkButton: { backgroundColor: COLORS.primaryLight, borderRadius: 8, paddingVertical: SPACING.sm + 4, alignItems: 'center', marginBottom: SPACING.sm },
  shareLinkText: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  smallLabel: { ...TYPOGRAPHY.small, fontWeight: '500', marginBottom: SPACING.sm },
  joinSettingRow: { flexDirection: 'row', gap: SPACING.sm },
  joinSettingButton: { flex: 1, paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.sm + 4, borderRadius: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  joinSettingActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  joinSettingText: { ...TYPOGRAPHY.small, fontWeight: '500' },
  joinSettingTextActive: { color: '#FFFFFF' },
  requestsSection: { marginBottom: SPACING.md },
  requestItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FEF3C7', borderRadius: 8, padding: SPACING.sm + 4, marginBottom: SPACING.sm },
  requestInfo: { flex: 1 },
  requestName: { ...TYPOGRAPHY.body, fontWeight: '600' },
  requestEmail: { ...TYPOGRAPHY.small },
  requestActions: { flexDirection: 'row', gap: SPACING.sm },
  approveButton: { backgroundColor: COLORS.success, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  approveButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  rejectButton: { backgroundColor: COLORS.danger, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rejectButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  memberBadges: { flexDirection: 'row', marginTop: SPACING.xs },
  adminBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: SPACING.xs + 4, paddingVertical: 2, borderRadius: 4, marginRight: SPACING.xs },
  adminBadgeText: { ...TYPOGRAPHY.small, color: '#B45309', fontWeight: '600' },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  adminToggleButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  adminToggleActive: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  adminToggleText: { fontSize: 16, color: COLORS.textMuted },
  adminToggleTextActive: { color: '#B45309' },
  removeText: { fontSize: 18, color: COLORS.danger, paddingHorizontal: 10 },
});