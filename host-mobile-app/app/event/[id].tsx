import { useState, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert, Linking, TextInput, FlatList, Dimensions, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

// IMPORTANT: Ensure this path is correct for your theme file
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

interface Attachment {
  uri: string;
  name: string;
  type: string;
}

export default function EventDetailsHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [invitation, setInvitation] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRsvp, setMyRsvp] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  
  const [isSaved, setIsSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [googleMapsLink, setGoogleMapsLink] = useState<string>('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);

  const [activeIndex, setActiveIndex] = useState(0);

  const [authCheckComplete, setAuthCheckComplete] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // --- Group Blast State ---
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [invitingGroup, setInvitingGroup] = useState<string | null>(null);

  const { width: screenWidth } = Dimensions.get('window');

  useFocusEffect(
    useCallback(() => {
      checkAuthAndFetch();
    }, [id])
  );

  const checkAuthAndFetch = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');

      if (!token) {
        setAuthCheckComplete(true);
        setLoading(false);
        await AsyncStorage.setItem('pendingRoute', `/event/${id}`);
        router.replace('/');
        return;
      }

      const userStr = await AsyncStorage.getItem('user');
      let currentId = null;
      if (userStr) {
        const userData = JSON.parse(userStr);
        currentId = userData._id || userData.id;
        setCurrentUserId(currentId);
      }

      const headers = { Authorization: `Bearer ${token}` };

      const eventRes = await axios.get(`${API_URL}/invitations/${id}`, { headers });
      const eventData = eventRes.data;
      setInvitation(eventData);

      const ownerId = eventData.host?._id || eventData.user;
      const userIsHost = currentId === ownerId;
      setIsHost(userIsHost); 

      if (eventData.videoUrl) setVideoUrl(eventData.videoUrl);
      if (eventData.googleMapsLink) setGoogleMapsLink(eventData.googleMapsLink);
      
      if (!userIsHost && eventData.myRsvp) setMyRsvp(eventData.myRsvp);
      if (eventData.isSaved !== undefined) setIsSaved(eventData.isSaved);

      if (userIsHost) {
        try {
          const guestRes = await axios.get(`${API_URL}/invitations/${id}/guests`, { headers });
          setGuests(guestRes.data.guests || []);
        } catch (guestErr: any) {
          setGuests([]); 
        }
      }

      setAuthCheckComplete(true);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load event details.');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadMyGroups = async () => {
    setLoadingGroups(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const res = await axios.get(`${API_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMyGroups(res.data || []);
    } catch (err) {
      Alert.alert("Error", "Failed to load your groups.");
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleInviteGroup = async (groupId: string, groupName: string) => {
    Alert.alert(
      "Blast Invite",
      `Are you sure you want to invite everyone in "${groupName}" to this event?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Invite All",
          onPress: async () => {
            setInvitingGroup(groupId);
            try {
              const token = await AsyncStorage.getItem('authToken');
              const res = await axios.post(
                `${API_URL}/groups/${groupId}/invitations/${id}`,
                {}, 
                { headers: { Authorization: `Bearer ${token}` } }
              );
              Alert.alert("Success", res.data.message || "Group invited successfully!");
              setShowGroupModal(false);
              checkAuthAndFetch(); // Refresh guest list
            } catch (err: any) {
              Alert.alert("Error", err.response?.data?.message || "Failed to blast invites");
            } finally {
              setInvitingGroup(null);
            }
          }
        }
      ]
    );
  };

  const handleRSVP = async (status: string) => {
    const previousRsvp = myRsvp;
    setMyRsvp(status);
    setRsvpLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.put(
        `${API_URL}/invitations/${id}/rsvp`, 
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMyRsvp(response.data.rsvpStatus);
      const statusMessage = status === 'accepted' ? 'attending' : status === 'declined' ? 'declined' : 'marked as maybe';
      Alert.alert('Success', `You are ${statusMessage}!`);
    } catch (err) {
      setMyRsvp(previousRsvp);
      Alert.alert('Error', 'Failed to update RSVP.');
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleToggleSave = async () => {
    setSaveLoading(true);
    const previousState = isSaved;
    setIsSaved(!isSaved);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.put(
        `${API_URL}/invitations/${id}/save`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsSaved(response.data.isSaved);
    } catch (err) {
      setIsSaved(previousState);
      Alert.alert('Error', 'Failed to update save status');
    } finally {
      setSaveLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) return Alert.alert('Permission Required', 'Please allow access.');

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets) {
        const newAttachments = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.fileName || `photo_${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        }));
        const combined = [...attachments, ...newAttachments].slice(0, 5);
        setAttachments(combined);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select images');
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const updateData: any = {};
      if (videoUrl) updateData.videoUrl = videoUrl;
      if (googleMapsLink) updateData.googleMapsLink = googleMapsLink;

      if (Object.keys(updateData).length > 0) {
        await axios.put(
          `${API_URL}/invitations/${id}`,
          updateData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      Alert.alert('Success', 'Event media updated successfully!');
      setIsEditing(false);
      setAttachments([]); 
      checkAuthAndFetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to update event media');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    Alert.alert(
      'Cancel Event',
      'Are you absolutely sure? This will delete the event and email all guests.',
      [
        { text: 'No, Keep It', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true); 
              const token = await AsyncStorage.getItem('authToken');
              await axios.delete(
                `${API_URL}/invitations/${id}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );              
              router.replace('/dashboard');
            } catch (error) {
              setIsDeleting(false);
              Alert.alert("Error", "Failed to cancel the event.");
            }
          },
        },
      ]
    );
  };

  const handleRemoveGuest = async (guestId: string) => {
    Alert.alert('Remove Guest', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('authToken');
            await axios.delete(
              `${API_URL}/invitations/${id}/guests/${guestId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            setGuests(prevGuests => prevGuests.filter(g => (g.recipient?._id || g._id) !== guestId));
          } catch (err) {
            Alert.alert('Error', 'Failed to remove guest');
          }
        },
      },
    ]);
  };

  if (loading || !authCheckComplete) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!invitation && authCheckComplete) return null; 

  if (isDeleting) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <Stack.Screen options={{ title: 'Cancelling...', headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.danger} />
        <Text style={{ marginTop: 10, color: COLORS.danger, fontWeight: 'bold' }}>Cancelling Event...</Text>
      </View>
    );
  }

  const attending = guests.filter(g => g.rsvpStatus === 'accepted').length;
  const pending = guests.filter(g => g.rsvpStatus === 'tentative' || !g.rsvpStatus).length;
  const declined = guests.filter(g => g.rsvpStatus === 'declined').length;

  const allImages = [invitation?.coverImage, ...(invitation?.attachments?.map((a: any) => typeof a === 'string' ? a : a.url || a.secure_url) || [])].filter(Boolean);

  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    setActiveIndex(Math.round(index));
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
      <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
        
        {allImages.length > 0 ? (
          <View style={{ height: 300, width: screenWidth, backgroundColor: '#e5e7eb' }}>
            <FlatList
              data={allImages}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, index) => index.toString()}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width: screenWidth, height: 300, resizeMode: 'cover' }} />
              )}
            />
          </View>
        ) : (
          <View style={[styles.coverImage, styles.carouselPlaceholder]}><Text style={{ fontSize: 40 }}>📅</Text></View>
        )}
        
        {!isHost && (
          <TouchableOpacity style={styles.bookmarkButton} onPress={handleToggleSave} disabled={saveLoading} activeOpacity={0.8}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={24} color={isSaved ? "#F59E0B" : "#FFFFFF"} />
          </TouchableOpacity>
        )}

        <View style={styles.detailsCard}>
          <Text style={styles.title}>{invitation.title}</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.icon}>📅</Text>
            <Text style={styles.infoText}>{new Date(invitation.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
          </View>
          
          <TouchableOpacity style={styles.infoRow} onPress={invitation.googleMapsLink ? () => Linking.openURL(invitation.googleMapsLink) : undefined} disabled={!invitation.googleMapsLink}>
            <Text style={styles.icon}>📍</Text>
            <Text style={[styles.infoText, invitation.googleMapsLink && { color: COLORS.primary, textDecorationLine: 'underline' }]}>{invitation.location}</Text>
          </TouchableOpacity>

          {invitation.videoUrl && (
            <TouchableOpacity style={styles.infoRow} onPress={() => Linking.openURL(invitation.videoUrl)}>
              <Text style={styles.icon}>🎬</Text>
              <Text style={[styles.infoText, { color: COLORS.primary, textDecorationLine: 'underline' }]}>Watch Video</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionsContainer}>
            {isHost ? (
              <View>
                <Text style={styles.sectionTitle}>RSVP Analytics</Text>
                <View style={styles.analyticsRow}>
                  <View style={[styles.analyticsCard, { backgroundColor: COLORS.success }]}><Text style={styles.analyticsNumber}>{attending}</Text><Text style={styles.analyticsLabel}>Going</Text></View>
                  <View style={[styles.analyticsCard, { backgroundColor: '#F59E0B' }]}><Text style={styles.analyticsNumber}>{pending}</Text><Text style={styles.analyticsLabel}>Pending</Text></View>
                  <View style={[styles.analyticsCard, { backgroundColor: COLORS.danger }]}><Text style={styles.analyticsNumber}>{declined}</Text><Text style={styles.analyticsLabel}>No</Text></View>
                </View>

                {guests.length > 0 && (
                  <View style={styles.guestListContainer}>
                    <Text style={styles.sectionTitle}>Attendee Roster</Text>
                    <Text style={styles.guestSummaryText}>{attending} Attending, {declined} Declined{pending > 0 ? `, ${pending} Pending` : ''}</Text>
                    {guests.slice(0, 5).map((guest: any, index: number) => {
                      const guestName = guest.recipient?.name || guest.name || 'Unknown Guest';
                      const guestEmail = guest.recipient?.email || guest.email || '';
                      const rsvpStatus = guest.rsvpStatus;
                      return (
                        <View key={index} style={[styles.guestRow, { justifyContent: 'space-between' }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <View style={styles.guestAvatar}><Text style={styles.guestInitial}>{guestName.charAt(0).toUpperCase()}</Text></View>
                            <View style={styles.guestInfo}>
                              <Text style={styles.guestName}>{guestName}</Text>
                              <Text style={styles.guestEmail}>{guestEmail}</Text>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                            <View style={[styles.guestStatus, rsvpStatus === 'accepted' && styles.guestStatusGoing, rsvpStatus === 'declined' && styles.guestStatusDeclined, (!rsvpStatus || rsvpStatus === 'tentative') && styles.guestStatusPending]}>
                              <Text style={styles.guestStatusText}>{rsvpStatus === 'accepted' ? 'Going' : rsvpStatus === 'declined' ? 'No' : 'Pending'}</Text>
                            </View>
                            <TouchableOpacity style={styles.removeGuestButton} onPress={() => handleRemoveGuest(guest.recipient?._id)}><Text style={styles.removeGuestText}>Remove</Text></TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* --- DUAL INVITE BUTTONS --- */}
                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg }}>
                  <TouchableOpacity 
                    style={[styles.button, { backgroundColor: COLORS.primary, flex: 1 }]} 
                    onPress={() => router.push('/invite/' + id)}
                  >
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>+ Individual</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.button, { backgroundColor: '#8B5CF6', flex: 1 }]} 
                    onPress={() => {
                      setShowGroupModal(true);
                      loadMyGroups();
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>👥 Invite Group</Text>
                  </TouchableOpacity>
                </View>
                {/* --------------------------- */}
                
                <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primaryLight, marginTop: SPACING.sm }]} onPress={() => setIsEditing(!isEditing)}>
                  <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>{isEditing ? 'Cancel Edit' : 'Edit Event Media'}</Text>
                </TouchableOpacity>

                {isEditing && (
                  <View style={styles.editSection}>
                    <Text style={styles.editSectionTitle}>Edit Event Media</Text>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Video URL (Optional)</Text>
                      <TextInput style={styles.input} placeholder="YouTube or video link" value={videoUrl} onChangeText={setVideoUrl} keyboardType="url" autoCapitalize="none" />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Google Maps Link</Text>
                      <TextInput style={styles.input} placeholder="Maps link" value={googleMapsLink} onChangeText={setGoogleMapsLink} keyboardType="url" autoCapitalize="none" />
                    </View>
                    <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSaveChanges} disabled={saving}>
                      {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View>
                <Text style={[styles.sectionTitle, { marginBottom: SPACING.md }]}>Will you attend?</Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  <TouchableOpacity disabled={rsvpLoading} onPress={() => handleRSVP('accepted')} style={[styles.rsvpBtn, myRsvp === 'accepted' ? { backgroundColor: COLORS.success } : { backgroundColor: COLORS.input }]}>
                    <Text style={{ fontWeight: 'bold', color: myRsvp === 'accepted' ? 'white' : COLORS.text }}>Going</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={rsvpLoading} onPress={() => handleRSVP('declined')} style={[styles.rsvpBtn, myRsvp === 'declined' ? { backgroundColor: COLORS.danger } : { backgroundColor: COLORS.input }]}>
                    <Text style={{ fontWeight: 'bold', color: myRsvp === 'declined' ? 'white' : COLORS.text }}>Can't Go</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {invitation.description && (
            <View style={{ marginTop: SPACING.xl }}>
              <Text style={styles.sectionTitle}>About this event</Text>
              <Text style={{ ...TYPOGRAPHY.body, lineHeight: 24 }}>{invitation.description}</Text>
            </View>
          )}
        </View>

        {isHost && (
          <View style={styles.bottomControlPanel}>
            <TouchableOpacity style={styles.editEventButton} onPress={() => router.push(`/edit/${id}`)}>
              <Text style={styles.editEventButtonText}>Edit Event Details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cancelEventButton, isDeleting && styles.cancelEventButtonDisabled]} onPress={handleDeleteEvent} disabled={isDeleting}>
              {isDeleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.cancelEventButtonText}>Cancel Event</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* --- GROUP INVITATION MODAL --- */}
      <Modal visible={showGroupModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>Select a Group</Text>
              <TouchableOpacity onPress={() => setShowGroupModal(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingGroups ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
            ) : myGroups.length === 0 ? (
              <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginVertical: 40 }}>
                You haven't created any groups yet.
              </Text>
            ) : (
              <FlatList
                data={myGroups}
                keyExtractor={(item) => item._id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={styles.groupItemCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupItemName}>{item.name}</Text>
                      <Text style={styles.groupItemCount}>{item.members?.length || 0} Members</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.blastButton, invitingGroup === item._id && { opacity: 0.7 }]}
                      disabled={invitingGroup === item._id}
                      onPress={() => handleInviteGroup(item._id, item.name)}
                    >
                      {invitingGroup === item._id ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.blastButtonText}>Blast Invite</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  carouselPlaceholder: { backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  coverImage: { width: '100%', height: 280, resizeMode: 'cover' },
  bookmarkButton: { position: 'absolute', top: 20, right: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 50 },
  detailsCard: { backgroundColor: COLORS.card, marginTop: -40, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: SPACING.lg, minHeight: 500, ...SHADOWS.card },
  title: { ...TYPOGRAPHY.title, fontSize: 28, marginBottom: SPACING.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  icon: { fontSize: 18, marginRight: SPACING.sm },
  infoText: { ...TYPOGRAPHY.bodyMuted, flex: 1 },
  actionsContainer: { marginTop: SPACING.xl, paddingTop: SPACING.lg, borderTopWidth: 1, borderColor: COLORS.border },
  sectionTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.sm },
  
  analyticsRow: { flexDirection: 'row', gap: SPACING.sm },
  analyticsCard: { flex: 1, padding: SPACING.md, borderRadius: 12, alignItems: 'center' },
  analyticsNumber: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  analyticsLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 4 },
  
  button: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rsvpBtn: { flex: 1, paddingVertical: 14, borderRadius: 100, alignItems: 'center' },
  
  editSection: { marginTop: SPACING.lg, padding: SPACING.md, backgroundColor: COLORS.background, borderRadius: 16 },
  editSectionTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.md },
  inputGroup: { marginBottom: SPACING.md },
  inputLabel: { ...TYPOGRAPHY.small, fontWeight: '600', marginBottom: SPACING.xs },
  input: { backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, ...TYPOGRAPHY.body, borderWidth: 1, borderColor: COLORS.border },
  
  saveButton: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: 'white', fontWeight: 'bold' },
  saveButtonDisabled: { opacity: 0.7 },

  guestListContainer: { marginTop: SPACING.lg, backgroundColor: COLORS.background, borderRadius: 12, padding: SPACING.md },
  guestSummaryText: { ...TYPOGRAPHY.bodyMuted, marginBottom: SPACING.md },
  guestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  guestAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm },
  guestInitial: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  guestInfo: { flex: 1 },
  guestName: { ...TYPOGRAPHY.body, fontWeight: '600' },
  guestEmail: { ...TYPOGRAPHY.small, color: COLORS.textMuted },
  guestStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, minWidth: 70, alignItems: 'center' },
  guestStatusGoing: { backgroundColor: COLORS.success + '20' },
  guestStatusDeclined: { backgroundColor: COLORS.danger + '20' },
  guestStatusPending: { backgroundColor: '#F59E0B' + '20' },
  guestStatusText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  removeGuestButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.danger },
  removeGuestText: { color: COLORS.danger, fontSize: 12, fontWeight: '600' },
  
  bottomControlPanel: { marginTop: SPACING.lg, marginBottom: SPACING.xl, paddingHorizontal: SPACING.lg },
  editEventButton: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: SPACING.md },
  editEventButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  cancelEventButton: { backgroundColor: COLORS.danger, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  cancelEventButtonDisabled: { opacity: 0.7 },
  cancelEventButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },

  // --- MODAL STYLES ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, maxHeight: '80%', ...SHADOWS.card },
  manageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  manageTitle: { ...TYPOGRAPHY.title, fontSize: 22 },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.textMuted },
  groupItemCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.background, borderRadius: 12, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  groupItemName: { ...TYPOGRAPHY.body, fontWeight: 'bold' },
  groupItemCount: { ...TYPOGRAPHY.small, color: COLORS.textMuted },
  blastButton: { backgroundColor: '#8B5CF6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  blastButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
});