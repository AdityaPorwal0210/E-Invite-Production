import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';

const API_URL = 'https://invitoinbox.onrender.com/api';

interface Invitation {
  _id: string;
  title?: string;
  eventDate?: string;
  location?: string;
  description?: string;
  coverImage?: string;
  videoUrl?: string;
  googleMapsLink?: string;
  host?: {
    _id?: string;
    name?: string;
    email?: string;
  };
  user?: string;
  rsvpStatus?: string;
  isSaved?: boolean;
  attachments?: Array<{
    url: string;
    type: string;
  }>;
}

export default function InvitationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [myRsvp, setMyRsvp] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authCheckComplete, setAuthCheckComplete] = useState<boolean>(false);

  useEffect(() => {
    console.log('🔗 Invitation screen opened with ID:', id);
    checkAuthAndFetch();
  }, [id]);

 const checkAuthAndFetch = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      
      console.log('🔐 Auth check:', token ? 'Token found' : 'No token');
      
      if (!token) {
        // DO ABSOLUTELY NOTHING. 
        // The Master Bouncer in _layout.tsx is already handling the redirect.
        // If we throw alerts or route here, we will cause a Call Stack crash.
        return; 
      }
      
      // User is logged in - proceed to fetch invitation
      console.log('✅ User authenticated, fetching invitation');
      setAuthCheckComplete(true);
      await fetchCurrentUser();
      await fetchInvitation();
      
    } catch (error) {
      console.error('❌ Auth check error:', error);
      setAuthCheckComplete(true);
      setLoading(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        setCurrentUserId(userData._id || userData.id);
        console.log('👤 Current user ID:', userData._id || userData.id);
      }
    } catch (e) {
      console.log('Failed to get current user');
    }
  };

  const fetchInvitation = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      
      console.log('📡 Fetching invitation from API:', id);

      const response = await axios.get(`${API_URL}/invitations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = response.data;
      console.log('📩 Invitation data received:', data.title);
      
      setInvitation(data);
      setMyRsvp(data.rsvpStatus || '');
      setIsSaved(data.isSaved || false);
      
      // Determine if current user is the owner
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        const userId = userData._id || userData.id;
        setCurrentUserId(userId);
        const ownerId = data.host?._id || data.user;
        setIsOwner(ownerId === userId);
        console.log('👑 Is owner:', ownerId === userId);
      }
    } catch (err) {
      console.error('❌ Fetch invitation error:', err);
      if (axios.isAxiosError(err)) {
        Alert.alert('Error', err.response?.data?.message || 'Failed to fetch invitation');
      } else if (err instanceof Error) {
        Alert.alert('Error', err.message);
      } else {
        Alert.alert('Error', 'Failed to fetch invitation');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async (status: string) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      
      console.log('📝 Updating RSVP to:', status);
      
      await axios.put(
        `${API_URL}/invitations/${id}/rsvp`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMyRsvp(status);
      Alert.alert('Success', `You have marked as "${status}"`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        Alert.alert('Error', err.response?.data?.message || 'Failed to update RSVP');
      } else if (err instanceof Error) {
        Alert.alert('Error', err.message);
      } else {
        Alert.alert('Error', 'Failed to update RSVP');
      }
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('authToken');
              
              await axios.delete(`${API_URL}/invitations/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });

              Alert.alert('Success', 'Event deleted successfully', [
                { text: 'OK', onPress: () => router.replace('/dashboard') },
              ]);
            } catch (err) {
              if (axios.isAxiosError(err)) {
                Alert.alert('Error', err.response?.data?.message || 'Failed to delete event');
              } else if (err instanceof Error) {
                Alert.alert('Error', err.message);
              } else {
                Alert.alert('Error', 'Failed to delete event');
              }
            }
          },
        },
      ]
    );
  };

  const handleOpenMaps = async () => {
    if (!invitation?.googleMapsLink) return;
    
    try {
      const supported = await Linking.canOpenURL(invitation.googleMapsLink);
      if (supported) {
        await Linking.openURL(invitation.googleMapsLink);
      } else {
        Alert.alert('Error', 'Cannot open this link');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open maps link');
    }
  };

  if (loading || !authCheckComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Opening invitation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!invitation) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load event</Text>
          <TouchableOpacity style={styles.retryButton} onPress={checkAuthAndFetch}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover Image */}
        {invitation.coverImage ? (
          <Image 
            source={{ uri: invitation.coverImage + '?t=' + new Date().getTime() }} 
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Text style={styles.coverPlaceholderText}>📅</Text>
          </View>
        )}

        {/* Event Header Card */}
        <View style={styles.eventCard}>
          <Text style={styles.eventTitle}>{invitation.title || 'Untitled Event'}</Text>
          
          <View style={styles.eventMetaRow}>
            <Text style={styles.eventIcon}>📅</Text>
            <Text style={styles.eventDate}>
              {invitation.eventDate 
                ? new Date(invitation.eventDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Date not set'}
            </Text>
          </View>
          
          <TouchableOpacity 
            style={styles.eventMetaRow}
            onPress={invitation.googleMapsLink ? handleOpenMaps : undefined}
            disabled={!invitation.googleMapsLink}
          >
            <Text style={styles.eventIcon}>📍</Text>
            <Text style={[styles.eventLocation, invitation.googleMapsLink && styles.eventLocationLink]}>
              {invitation.location || 'Location not set'}
            </Text>
          </TouchableOpacity>
          
          <View style={styles.eventMetaRow}>
            <Text style={styles.eventIcon}>👤</Text>
            <Text style={styles.eventHost}>
              Hosted by {invitation.host?.name || 'Unknown'}
            </Text>
          </View>
        </View>

        {/* Owner Actions */}
        {isOwner && (
          <View style={styles.ownerActions}>
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={() => router.push('/invite/' + id)}
              activeOpacity={0.8}
            >
              <Text style={styles.inviteButtonText}>+ Invite More</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.guestListButton}
              onPress={() => router.push('/event/' + id)}
              activeOpacity={0.8}
            >
              <Text style={styles.guestListButtonText}>Guest List</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              activeOpacity={0.8}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Guest RSVP */}
        {!isOwner && (
          <View style={styles.rsvpSection}>
            <Text style={styles.rsvpTitle}>Your Response</Text>
            <View style={styles.rsvpButtons}>
              <TouchableOpacity
                style={[
                  styles.rsvpButton,
                  myRsvp === 'going' && styles.rsvpButtonActive
                ]}
                onPress={() => handleRSVP('going')}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.rsvpButtonText,
                  myRsvp === 'going' && styles.rsvpButtonTextActive
                ]}>Going</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.rsvpButton,
                  myRsvp === 'maybe' && styles.rsvpButtonActive
                ]}
                onPress={() => handleRSVP('maybe')}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.rsvpButtonText,
                  myRsvp === 'maybe' && styles.rsvpButtonTextActive
                ]}>Maybe</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.rsvpButton,
                  myRsvp === 'not_going' && styles.rsvpButtonActive
                ]}
                onPress={() => handleRSVP('not_going')}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.rsvpButtonText,
                  myRsvp === 'not_going' && styles.rsvpButtonTextActive
                ]}>Can't Go</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Video Link */}
        {invitation.videoUrl && (
          <View style={styles.videoSection}>
            <Text style={styles.sectionTitle}>Video</Text>
            <TouchableOpacity
              style={styles.videoButton}
              onPress={() => Linking.openURL(invitation.videoUrl!)}
              activeOpacity={0.8}
            >
              <Text style={styles.videoButtonText}>▶ Watch Video</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Description */}
        {invitation.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.descriptionText}>{invitation.description}</Text>
          </View>
        )}

        {/* Attachments */}
        {invitation.attachments && invitation.attachments.length > 0 && (
          <View style={styles.attachmentsSection}>
            <Text style={styles.sectionTitle}>Attachments</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachmentsScroll}
            >
              {invitation.attachments.map((attachment, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.attachmentItem}
                  onPress={() => Linking.openURL(attachment.url)}
                >
                  <Text style={styles.attachmentIcon}>📎</Text>
                  <Text style={styles.attachmentText} numberOfLines={1}>
                    Attachment {index + 1}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ... keep all your existing styles ...
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  loadingText: {
    marginTop: SPACING.sm,
    ...TYPOGRAPHY.body,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.danger,
    marginBottom: SPACING.md,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
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
  coverImage: {
    width: '100%',
    height: 250,
  },
  coverPlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholderText: {
    fontSize: 64,
  },
  eventCard: {
    marginTop: -30,
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  eventTitle: {
    ...TYPOGRAPHY.title,
    marginBottom: SPACING.md,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  eventIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
  },
  eventDate: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '500',
  },
  eventLocation: {
    ...TYPOGRAPHY.body,
    flex: 1,
  },
  eventLocationLink: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  eventHost: {
    ...TYPOGRAPHY.bodyMuted,
  },
  ownerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  inviteButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  inviteButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  guestListButton: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 100,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  guestListButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 100,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  deleteButtonText: {
    color: COLORS.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  rsvpSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  rsvpTitle: {
    ...TYPOGRAPHY.header,
    marginBottom: SPACING.sm,
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  rsvpButton: {
    flex: 1,
    backgroundColor: COLORS.input,
    borderRadius: 12,
    paddingVertical: SPACING.sm + 4,
    alignItems: 'center',
  },
  rsvpButtonActive: {
    backgroundColor: COLORS.primary,
  },
  rsvpButtonText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  rsvpButtonTextActive: {
    color: '#FFFFFF',
  },
  videoSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
  },
  videoButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  videoButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  descriptionSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.header,
    marginBottom: SPACING.sm,
  },
  descriptionText: {
    ...TYPOGRAPHY.body,
    lineHeight: 24,
  },
  attachmentsSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
  },
  attachmentsScroll: {
    paddingVertical: SPACING.xs,
  },
  attachmentItem: {
    backgroundColor: COLORS.card,
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
  attachmentText: {
    ...TYPOGRAPHY.small,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});