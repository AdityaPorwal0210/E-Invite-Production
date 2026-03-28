import { useState, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert, Linking, TextInput, FlatList, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

// IMPORTANT: Ensure this path is correct for your theme file
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';

const API_URL = 'https://invitoinbox.onrender.com/api';

interface Attachment {
  uri: string;
  name: string;
  type: string;
}

export default function EventDetailsHub() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();

  const [invitation, setInvitation] = useState<any>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRsvp, setMyRsvp] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  
  // Save state
  const [isSaved, setIsSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [googleMapsLink, setGoogleMapsLink] = useState<string>('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);

  // Carousel state
  const [activeIndex, setActiveIndex] = useState(0);

  const isHost = mode !== 'attending';

  // Screen dimensions
  const screenWidth = Dimensions.get('window').width;

  useFocusEffect(
    useCallback(() => {
      fetchEventData();
    }, [id])
  );

  const fetchEventData = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Fetch Event Details (Primary Goal)
      const eventRes = await axios.get(`${API_URL}/invitations/${id}`, { headers });
      setInvitation(eventRes.data);
      
      // Set additional fields if they exist
      if (eventRes.data.videoUrl) setVideoUrl(eventRes.data.videoUrl);
      if (eventRes.data.googleMapsLink) setGoogleMapsLink(eventRes.data.googleMapsLink);
      
      // 2. Try to map RSVP status if attending
      if (!isHost && eventRes.data.myRsvp) setMyRsvp(eventRes.data.myRsvp);
      
      // 3. Set isSaved state
      if (eventRes.data.isSaved !== undefined) setIsSaved(eventRes.data.isSaved);

      // 4. Safely Fetch Guest List (Do not let this crash the main screen)
      if (isHost) {
        try {
          const guestRes = await axios.get(`${API_URL}/invitations/${id}/guests`, { headers });
          setGuests(guestRes.data.guests || []);
        } catch (guestErr: any) {
          // If the server denies guest list access, just log it. Do NOT crash.
          console.warn("Guest List Blocked by Server:", guestErr.response?.data?.message);
          setGuests([]); // Clear it just in case
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch primary event data:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async (status: string) => {
    // Store previous state for rollback
    const previousRsvp = myRsvp;
    
    // Optimistic UI update - immediately update the state
    setMyRsvp(status);
    setRsvpLoading(true);
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.put(
        `${API_URL}/invitations/${id}/rsvp`, 
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Update with server response
      setMyRsvp(response.data.rsvpStatus);
      
      // Format status for alert message
      const statusMessage = status === 'accepted' ? 'attending' : status === 'declined' ? 'declined' : 'marked as maybe';
      Alert.alert('Success', `You are ${statusMessage}!`);
    } catch (err) {
      // Rollback on error
      setMyRsvp(previousRsvp);
      if (axios.isAxiosError(err)) {
        Alert.alert('Error', err.response?.data?.message || 'Failed to update RSVP. Please try again.');
      } else if (err instanceof Error) {
        Alert.alert('Error', err.message);
      } else {
        Alert.alert('Error', 'Failed to update RSVP. Please try again.');
      }
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleToggleSave = async () => {
    setSaveLoading(true);
    // Optimistic update
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
      // Revert on error
      setIsSaved(previousState);
      if (axios.isAxiosError(err)) {
        Alert.alert('Error', err.response?.data?.message || 'Failed to update save status');
      } else if (err instanceof Error) {
        Alert.alert('Error', err.message);
      } else {
        Alert.alert('Error', 'Failed to update save status');
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library.');
        return;
      }

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
        
        // Limit to 5 attachments max
        const combined = [...attachments, ...newAttachments].slice(0, 5);
        setAttachments(combined);
        
        if (attachments.length >= 5) {
          Alert.alert('Limit Reached', 'Maximum 5 attachments allowed.');
        }
      }
    } catch (error) {
      console.error('Error picking images:', error);
      Alert.alert('Error', 'Failed to select images');
    }
  };

  const removeAttachment = (index: number) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    setAttachments(newAttachments);
  };

  const handleOpenMaps = async () => {
    if (!googleMapsLink) return;
    
    try {
      const supported = await Linking.canOpenURL(googleMapsLink);
      if (supported) {
        await Linking.openURL(googleMapsLink);
      } else {
        Alert.alert('Error', 'Cannot open this link');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open maps link');
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);

    try {
      const token = await AsyncStorage.getItem('authToken');
      
      // Update text fields (videoUrl, googleMapsLink) - backend supports these
      const updateData: any = {};
      
      if (videoUrl) {
        updateData.videoUrl = videoUrl;
      }
      if (googleMapsLink) {
        updateData.googleMapsLink = googleMapsLink;
      }

      // Only make API call if there are changes
      if (Object.keys(updateData).length > 0) {
        await axios.put(
          `${API_URL}/invitations/${id}`,
          updateData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      }

      Alert.alert('Success', 'Event media updated successfully!');
      setIsEditing(false);
      setAttachments([]); // Clear local attachments
      fetchEventData();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        Alert.alert('Error', err.response?.data?.message || 'Failed to update event media');
      } else if (err instanceof Error) {
        Alert.alert('Error', err.message);
      } else {
        Alert.alert('Error', 'Failed to update event media');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !invitation) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Analytics Math
  const attending = guests.filter(g => g.rsvpStatus === 'accepted').length;
  const pending = guests.filter(g => g.rsvpStatus === 'tentative' || !g.rsvpStatus).length;
  const declined = guests.filter(g => g.rsvpStatus === 'declined').length;

  // Consolidated image carousel data - normalize to handle both strings (coverImage) and objects (attachments with .url)
  const allImages = [
    invitation?.coverImage,
    ...(invitation?.attachments || []).map((att: any) => att.url || att)
  ].filter(Boolean);

  // Debug logging to see actual data structure
  console.log('DEBUG coverImage:', invitation?.coverImage);
  console.log('DEBUG attachments:', JSON.stringify(invitation?.attachments, null, 2));
  console.log('DEBUG allImages:', allImages);

  // Handle scroll to update pagination
  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    setActiveIndex(roundIndex);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
      <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
        
        {/* Cover Image */}
        {invitation.coverImage ? (
          <Image 
            source={{ uri: invitation.coverImage }} 
            style={styles.coverImage} 
          />
        ) : (
          <View style={[styles.coverImage, styles.carouselPlaceholder]}>
            <Text style={{ fontSize: 40 }}>📅</Text>
          </View>
        )}
        
        {/* Save/Bookmark Button - Absolutely positioned top-right */}
        {!isHost && (
          <TouchableOpacity
            style={styles.bookmarkButton}
            onPress={handleToggleSave}
            disabled={saveLoading}
            activeOpacity={0.8}
          >
            <Ionicons 
              name={isSaved ? "bookmark" : "bookmark-outline"} 
              size={24} 
              color={isSaved ? "#F59E0B" : "#FFFFFF"} 
            />
          </TouchableOpacity>
        )}

        {/* Attachments Section - Show below cover image */}
        <View style={styles.attachmentsCarousel}>
          <Text style={styles.sectionTitle}>Event Photos ({invitation.attachments?.length || 0})</Text>
          {invitation.attachments && invitation.attachments.length > 0 ? (
            <FlatList
              data={invitation.attachments}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => {
                // Handle both string URLs and object format
                const imageUrl = typeof item === 'string' ? item : (item.url || item);
                console.log(`Attachment ${index}:`, imageUrl);
                return (
                  <Image 
                    source={{ uri: imageUrl }} 
                    style={styles.attachmentThumbnail} 
                  />
                );
              }}
            />
          ) : (
            <View style={styles.noAttachments}>
              <Text style={styles.noAttachmentsText}>No additional photos</Text>
            </View>
          )}
        </View>

        {/* Debug Section - Show raw data */}
        {process.env.NODE_ENV !== 'production' && (
          <View style={styles.debugSection}>
            <Text style={styles.debugTitle}>Debug Info</Text>
            <Text style={styles.debugText}>Cover Image: {invitation.coverImage ? 'Yes' : 'No'}</Text>
            <Text style={styles.debugText}>Attachments: {invitation.attachments ? JSON.stringify(invitation.attachments) : 'undefined'}</Text>
          </View>
        )}

        {/* Main Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.title}>{invitation.title}</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.icon}>📅</Text>
            <Text style={styles.infoText}>{new Date(invitation.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
          </View>
          
          <TouchableOpacity 
            style={styles.infoRow}
            onPress={invitation.googleMapsLink ? () => Linking.openURL(invitation.googleMapsLink) : undefined}
            disabled={!invitation.googleMapsLink}
          >
            <Text style={styles.icon}>📍</Text>
            <Text style={[styles.infoText, invitation.googleMapsLink && { color: COLORS.primary, textDecorationLine: 'underline' }]}>
              {invitation.location}
            </Text>
          </TouchableOpacity>

          {/* Video Link */}
          {invitation.videoUrl && (
            <TouchableOpacity 
              style={styles.infoRow}
              onPress={() => Linking.openURL(invitation.videoUrl)}
            >
              <Text style={styles.icon}>🎬</Text>
              <Text style={[styles.infoText, { color: COLORS.primary, textDecorationLine: 'underline' }]}>
                Watch Video
              </Text>
            </TouchableOpacity>
          )}

          {/* --- THE LOGIC FORK --- */}
          <View style={styles.actionsContainer}>
            {isHost ? (
              // HOST VIEW
              <View>
                {/* Analytics Summary */}
                <Text style={styles.sectionTitle}>RSVP Analytics</Text>
                <View style={styles.analyticsRow}>
                  <View style={[styles.analyticsCard, { backgroundColor: COLORS.success }]}>
                    <Text style={styles.analyticsNumber}>{attending}</Text>
                    <Text style={styles.analyticsLabel}>Going</Text>
                  </View>
                  <View style={[styles.analyticsCard, { backgroundColor: COLORS.accent }]}>
                    <Text style={styles.analyticsNumber}>{pending}</Text>
                    <Text style={styles.analyticsLabel}>Pending</Text>
                  </View>
                  <View style={[styles.analyticsCard, { backgroundColor: COLORS.danger }]}>
                    <Text style={styles.analyticsNumber}>{declined}</Text>
                    <Text style={styles.analyticsLabel}>No</Text>
                  </View>
                </View>

                {/* Attendee Roster */}
                {guests.length > 0 && (
                  <View style={styles.guestListContainer}>
                    <Text style={styles.sectionTitle}>Attendee Roster</Text>
                    <Text style={styles.guestSummaryText}>
                      {attending} Attending, {declined} Declined{pending > 0 ? `, ${pending} Pending` : ''}
                    </Text>
                    {guests.slice(0, 5).map((guest: any, index: number) => {
                      // Access nested recipient data from backend
                      const guestName = guest.recipient?.name || guest.name || 'Unknown Guest';
                      const guestEmail = guest.recipient?.email || guest.email || '';
                      const rsvpStatus = guest.rsvpStatus;
                      
                      return (
                        <View key={index} style={styles.guestRow}>
                          <View style={styles.guestAvatar}>
                            <Text style={styles.guestInitial}>
                              {guestName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.guestInfo}>
                            <Text style={styles.guestName}>{guestName}</Text>
                            <Text style={styles.guestEmail}>{guestEmail}</Text>
                          </View>
                          <View style={[
                            styles.guestStatus,
                            rsvpStatus === 'accepted' && styles.guestStatusGoing,
                            rsvpStatus === 'declined' && styles.guestStatusDeclined,
                            (!rsvpStatus || rsvpStatus === 'tentative') && styles.guestStatusPending
                          ]}>
                            <Text style={styles.guestStatusText}>
                              {rsvpStatus === 'accepted' ? 'Going' : 
                               rsvpStatus === 'declined' ? 'No' : 'Pending'}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    {guests.length > 5 && (
                      <Text style={styles.moreGuestsText}>+{guests.length - 5} more guests</Text>
                    )}
                  </View>
                )}

                {/* Action Buttons */}
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: COLORS.primary, marginTop: SPACING.lg }]} 
                  onPress={() => router.push('/invite/' + id)}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>+ Invite More Guests</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: COLORS.primaryLight, marginTop: SPACING.sm }]} 
                  onPress={() => setIsEditing(!isEditing)}
                >
                  <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>
                    {isEditing ? 'Cancel Edit' : 'Edit Event Media'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: COLORS.primaryLight, marginTop: SPACING.sm }]} 
                  onPress={() => router.push(`/edit/${id}`)}
                >
                  <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>Edit Event Details</Text>
                </TouchableOpacity>

                {/* Edit Media Section */}
                {isEditing && (
                  <View style={styles.editSection}>
                    <Text style={styles.editSectionTitle}>Edit Event Media</Text>
                    
                    {/* Video URL */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Video URL (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="YouTube or video link"
                        placeholderTextColor={COLORS.textMuted}
                        value={videoUrl}
                        onChangeText={setVideoUrl}
                        keyboardType="url"
                        autoCapitalize="none"
                      />
                    </View>

                    {/* Google Maps Link */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Google Maps Link (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="https://maps.google.com/..."
                        placeholderTextColor={COLORS.textMuted}
                        value={googleMapsLink}
                        onChangeText={setGoogleMapsLink}
                        keyboardType="url"
                        autoCapitalize="none"
                      />
                    </View>

                    {/* Attachments */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Attachments (max 5)</Text>
                      <TouchableOpacity
                        style={styles.attachmentButton}
                        onPress={pickImage}
                      >
                        <Text style={styles.attachmentIcon}>📷</Text>
                        <Text style={styles.attachmentButtonText}>Select Images from Gallery</Text>
                      </TouchableOpacity>
                      
                      {attachments.length > 0 && (
                        <View style={styles.attachmentPreviewContainer}>
                          {attachments.map((attachment, index) => (
                            <View key={index} style={styles.attachmentPreview}>
                              <Image source={{ uri: attachment.uri }} style={styles.previewImage} />
                              <TouchableOpacity
                                style={styles.removeButton}
                                onPress={() => removeAttachment(index)}
                              >
                                <Text style={styles.removeText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    {/* Save Button */}
                    <TouchableOpacity
                      style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                      onPress={handleSaveChanges}
                      disabled={saving}
                      activeOpacity={0.8}
                    >
                      {saving ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              // GUEST VIEW
              <View>
                <Text style={[styles.sectionTitle, { marginBottom: SPACING.md }]}>Will you attend?</Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  <TouchableOpacity 
                    disabled={rsvpLoading}
                    onPress={() => handleRSVP('accepted')}
                    style={[styles.rsvpBtn, myRsvp === 'accepted' ? { backgroundColor: COLORS.success } : { backgroundColor: COLORS.input }]}
                  >
                    <Text style={{ fontWeight: 'bold', color: myRsvp === 'accepted' ? 'white' : COLORS.text }}>Going</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    disabled={rsvpLoading}
                    onPress={() => handleRSVP('declined')}
                    style={[styles.rsvpBtn, myRsvp === 'declined' ? { backgroundColor: COLORS.danger } : { backgroundColor: COLORS.input }]}
                  >
                    <Text style={{ fontWeight: 'bold', color: myRsvp === 'declined' ? 'white' : COLORS.text }}>Can't Go</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Description */}
          {invitation.description && (
            <View style={{ marginTop: SPACING.xl }}>
              <Text style={styles.sectionTitle}>About this event</Text>
              <Text style={{ ...TYPOGRAPHY.body, lineHeight: 24 }}>{invitation.description}</Text>
            </View>
          )}

        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  carouselContainer: { position: 'relative', width: '100%', height: 280 },
  carouselImage: { width: Dimensions.get('window').width, height: 280, resizeMode: 'cover' },
  carouselPlaceholder: { backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  paginationContainer: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  paginationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 4 },
  paginationDotActive: { backgroundColor: '#FFFFFF', width: 24 },
  coverImageContainer: { position: 'relative', width: '100%', height: 280 },
  coverImage: { width: '100%', height: 280, resizeMode: 'cover' },
  bookmarkButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 50,
  },
  detailsCard: {
    backgroundColor: COLORS.card,
    marginTop: -40,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: SPACING.lg,
    minHeight: 500,
    ...SHADOWS.card,
  },
  title: { ...TYPOGRAPHY.title, fontSize: 28, marginBottom: SPACING.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  icon: { fontSize: 18, marginRight: SPACING.sm },
  infoText: { ...TYPOGRAPHY.bodyMuted, flex: 1 },
  actionsContainer: { marginTop: SPACING.xl, paddingTop: SPACING.lg, borderTopWidth: 1, borderColor: COLORS.border },
  sectionTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.sm },
  
  // Save Button (for guests)
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 100,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: -50,
    marginBottom: 10,
    alignSelf: 'center',
    ...SHADOWS.card,
  },
  saveButtonActive: {
    backgroundColor: '#F59E0B',
  },
  saveButtonIcon: {
    fontSize: 18,
    marginRight: 6,
    color: '#D97706',
  },
  saveButtonText: {
    fontWeight: '600',
    fontSize: 14,
    color: '#D97706',
  },
  saveButtonTextActive: {
    color: '#FFFFFF',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  
  // Analytics
  analyticsRow: { flexDirection: 'row', gap: SPACING.sm },
  analyticsCard: { flex: 1, padding: SPACING.md, borderRadius: 12, alignItems: 'center' },
  analyticsNumber: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  analyticsLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 4 },
  
  // Buttons
  button: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rsvpBtn: { flex: 1, paddingVertical: 14, borderRadius: 100, alignItems: 'center' },
  
  // Attachments Section
  attachmentsSection: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  attachmentsScroll: {
    paddingVertical: SPACING.xs,
  },
  attachmentItem: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: SPACING.md,
    marginRight: SPACING.sm,
    alignItems: 'center',
    minWidth: 100,
    ...SHADOWS.card,
  },
  attachmentIcon: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  attachmentsCarousel: {
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    marginTop: -40,
  },
  attachmentThumbnail: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: SPACING.sm,
    resizeMode: 'cover',
  },
  attachmentText: {
    ...TYPOGRAPHY.small,
    fontWeight: '500',
  },
  
  // Edit Section
  editSection: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: 16,
  },
  editSectionTitle: {
    ...TYPOGRAPHY.header,
    marginBottom: SPACING.md,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    ...TYPOGRAPHY.small,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  attachmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
  },
  attachmentButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginLeft: SPACING.sm,
  },
  attachmentPreviewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  attachmentPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Guest List Styles
  guestListContainer: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: SPACING.md,
  },
  guestSummaryText: {
    ...TYPOGRAPHY.bodyMuted,
    marginBottom: SPACING.md,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  guestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  guestInitial: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  guestInfo: {
    flex: 1,
  },
  guestName: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
  },
  guestEmail: {
    ...TYPOGRAPHY.small,
    color: COLORS.textMuted,
  },
  guestStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 70,
    alignItems: 'center',
  },
  guestStatusGoing: {
    backgroundColor: COLORS.success + '20',
  },
  guestStatusDeclined: {
    backgroundColor: COLORS.danger + '20',
  },
  guestStatusPending: {
    backgroundColor: COLORS.accent + '20',
  },
  guestStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  moreGuestsText: {
    ...TYPOGRAPHY.small,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  
  // Debug Section
  debugSection: {
    backgroundColor: '#FFF3CD',
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderRadius: 8,
  },
  debugTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: SPACING.xs,
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  
  // No Attachments
  noAttachments: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  noAttachmentsText: {
    ...TYPOGRAPHY.bodyMuted,
    fontStyle: 'italic',
  },
});
