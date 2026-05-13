import Toast from 'react-native-toast-message';
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../utils/api';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';
import PremiumUpgradeModal from '../../components/PremiumUpgradeModal';

const FREE_GUEST_LIMIT = 50;

interface Invitation {
  _id: string;
  title?: string;
  eventDate?: string;
  location?: string;
  description?: string;
  coverImage?: string;
  videoUrl?: string;
  googleMapsLink?: string;
  isPremium?: boolean;
  host?: { _id?: string; name?: string; email?: string };
  user?: string;
  rsvpStatus?: string;
  isSaved?: boolean;
  guestList?: Array<any>;
  attachments?: Array<{ url: string; type: string }>;
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
  
  // Paywall Logic States
  const [paywallActive, setPaywallActive] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [guestCount, setGuestCount] = useState(0);

  useEffect(() => {
    console.log('🔗 Invitation screen opened with ID:', id);
    checkAuthAndFetch();
  }, [id]);

  const checkAuthAndFetch = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        setAuthCheckComplete(true);
        setLoading(false);
        await AsyncStorage.setItem('pendingRoute', `/invitation/${id}`);
        router.replace('/');
        return;
      }
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
      }
    } catch (e) {
      console.log('Failed to get current user');
    }
  };

  const fetchInvitation = async () => {
    try {
      const rawId = Array.isArray(id) ? id[0] : id;
      if (!rawId) throw new Error('No ID found in URL');
      const cleanId = rawId.split('?')[0].replace(/\//g, '');

      // Check if Paywall is active on the server
      api.get('/config/paywall')
        .then(res => setPaywallActive(res.data.paywallActive))
        .catch(err => console.log('Config fetch failed'));

      // Fetch the Event Data
      const response = await api.get(`/invitations/${cleanId}`);
      const data = response.data;

      setInvitation(data);
      setMyRsvp(data.rsvpStatus || '');
      setIsSaved(data.isSaved || false);
      setGuestCount(data.guestList?.length || 0);

      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        const userId = userData._id || userData.id;
        setCurrentUserId(userId);
        const ownerId = data.host?._id || data.user;
        setIsOwner(ownerId === userId);
      }
    } catch (err: any) {
      console.log('❌ Fetch invitation error:', err?.response?.data || err.message);
      Alert.alert('Error', 'Failed to load this invitation. It may have been deleted or the URL is invalid.');
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async (status: string) => {
    const previousRsvp = myRsvp;
    setMyRsvp(status);
    try {
      const response = await api.put(`/invitations/${id}/rsvp`, { status });
      setMyRsvp(response.data.rsvpStatus || status);
      const statusMessage =
        status === 'accepted' ? 'attending' : status === 'declined' ? 'declined' : 'marked as maybe';
      Toast.show({
        type: 'success',
        text1: 'RSVP Updated',
        text2: `You are now ${statusMessage}.`,
        position: 'bottom',
      });
    } catch (err: any) {
      setMyRsvp(previousRsvp);
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: 'Could not save your RSVP. Try again.',
        position: 'bottom',
      });
    }
  };

  const handleDelete = async () => {
    Alert.alert('Delete Event', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/invitations/${id}`);
            Alert.alert('Success', 'Event deleted successfully', [
              { text: 'OK', onPress: () => router.replace('/dashboard') },
            ]);
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Failed to delete event');
          }
        },
      },
    ]);
  };

  const handleOpenMaps = async () => {
    if (!invitation?.googleMapsLink) return;
    try {
      const supported = await Linking.canOpenURL(invitation.googleMapsLink);
      if (supported) await Linking.openURL(invitation.googleMapsLink);
      else Alert.alert('Error', 'Cannot open this link');
    } catch {
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

  const atLimit = guestCount >= FREE_GUEST_LIMIT;
  const nearLimit = !atLimit && guestCount >= FREE_GUEST_LIMIT * 0.8;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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

        <View style={styles.eventCard}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md }}>
            <Text style={[styles.eventTitle, { flex: 1 }]}>{invitation.title || 'Untitled Event'}</Text>
            {invitation.isPremium && (
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>⭐ Premium</Text>
              </View>
            )}
          </View>

          <View style={styles.eventMetaRow}>
            <Text style={styles.eventIcon}>📅</Text>
            <Text style={styles.eventDate}>
              {invitation.eventDate
                ? new Date(invitation.eventDate).toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
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
            <Text style={styles.eventHost}>Hosted by {invitation.host?.name || 'Unknown'}</Text>
          </View>
        </View>

        {isOwner && (
          <View style={styles.ownerActions}>
            <TouchableOpacity style={styles.inviteButton} onPress={() => router.push('/invite/' + id)} activeOpacity={0.8}>
              <Text style={styles.inviteButtonText}>+ Invite More</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.guestListButton} onPress={() => router.push('/event/' + id)} activeOpacity={0.8}>
              <Text style={styles.guestListButtonText}>
                👥 Guests ({guestCount}/{invitation.isPremium || !paywallActive ? '∞' : FREE_GUEST_LIMIT})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.8}>
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>

            {invitation.isPremium ? (
              <View style={styles.premiumActiveBtn}>
                <Text style={styles.premiumActiveBtnText}>⭐ Premium Active</Text>
              </View>
            ) : paywallActive ? (
              <TouchableOpacity style={styles.upgradeButton} onPress={() => setShowUpgradeModal(true)} activeOpacity={0.8}>
                <Text style={styles.upgradeButtonText}>⭐ Upgrade — ₹419</Text>
              </TouchableOpacity>
            ) : null}

            {paywallActive && !invitation.isPremium && (atLimit || nearLimit) && (
              <View style={[styles.limitWarning, atLimit && styles.limitWarningRed]}>
                <Text style={[styles.limitWarningText, atLimit && styles.limitWarningTextRed]}>
                  {atLimit
                    ? `🚫 Guest limit reached (${FREE_GUEST_LIMIT}/${FREE_GUEST_LIMIT}). Upgrade to invite more.`
                    : `⚠️ ${guestCount}/${FREE_GUEST_LIMIT} guests used. Upgrade before you hit the limit.`}
                </Text>
                {atLimit && (
                  <TouchableOpacity onPress={() => setShowUpgradeModal(true)}>
                    <Text style={styles.limitWarningLink}>Upgrade now →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {!isOwner && (
          <View style={styles.rsvpSection}>
            <Text style={styles.rsvpTitle}>Your Response</Text>
            <View style={styles.rsvpButtons}>
              <TouchableOpacity style={[styles.rsvpButton, myRsvp === 'accepted' && styles.rsvpButtonActive]} onPress={() => handleRSVP('accepted')}>
                <Text style={[styles.rsvpButtonText, myRsvp === 'accepted' && styles.rsvpButtonTextActive]}>Going</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rsvpButton, myRsvp === 'tentative' && styles.rsvpButtonActive]} onPress={() => handleRSVP('tentative')}>
                <Text style={[styles.rsvpButtonText, myRsvp === 'tentative' && styles.rsvpButtonTextActive]}>Maybe</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rsvpButton, myRsvp === 'declined' && styles.rsvpButtonActive]} onPress={() => handleRSVP('declined')}>
                <Text style={[styles.rsvpButtonText, myRsvp === 'declined' && styles.rsvpButtonTextActive]}>Can't Go</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Attachments & Description would normally go here */}
        
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* The Native Razorpay Checkout Modal */}
      <PremiumUpgradeModal
        visible={showUpgradeModal}
        invitationId={id as string}
        onClose={() => setShowUpgradeModal(false)}
        onSuccess={(updatedInvitation) => {
          setInvitation(updatedInvitation);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  loadingText: { marginTop: SPACING.sm, ...TYPOGRAPHY.body },
  errorText: { ...TYPOGRAPHY.body, color: COLORS.danger, marginBottom: SPACING.md },
  retryButton: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: 8 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center', padding: SPACING.md,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backButton: { fontSize: 24, color: COLORS.text, padding: SPACING.xs },
  headerTitle: { flex: 1, ...TYPOGRAPHY.header, textAlign: 'center' },
  headerSpacer: { width: 40 },

  scrollView: { flex: 1 },
  coverImage: { width: '100%', height: 250 },
  coverPlaceholder: { width: '100%', height: 250, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  coverPlaceholderText: { fontSize: 64 },

  eventCard: {
    marginTop: -30, marginHorizontal: SPACING.md, backgroundColor: COLORS.card,
    borderRadius: 24, padding: SPACING.lg, ...SHADOWS.card,
  },
  eventTitle: { ...TYPOGRAPHY.title, marginBottom: 0 },
  premiumBadge: {
    backgroundColor: '#FEF9C3', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    marginLeft: SPACING.sm, alignSelf: 'flex-start',
  },
  premiumBadgeText: { color: '#92400E', fontSize: 12, fontWeight: '700' },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  eventIcon: { fontSize: 16, marginRight: SPACING.sm },
  eventDate: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '500' },
  eventLocation: { ...TYPOGRAPHY.body, flex: 1 },
  eventLocationLink: { color: COLORS.primary, textDecorationLine: 'underline' },
  eventHost: { ...TYPOGRAPHY.bodyMuted },

  ownerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  inviteButton: { backgroundColor: COLORS.primary, borderRadius: 100, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  inviteButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  guestListButton: { backgroundColor: COLORS.primaryLight, borderRadius: 100, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  guestListButtonText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  deleteButton: { backgroundColor: '#FEE2E2', borderRadius: 100, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  deleteButtonText: { color: COLORS.danger, fontWeight: '600', fontSize: 14 },
  upgradeButton: { backgroundColor: '#F59E0B', borderRadius: 100, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  upgradeButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  premiumActiveBtn: { backgroundColor: '#FEF9C3', borderRadius: 100, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  premiumActiveBtnText: { color: '#92400E', fontWeight: '700', fontSize: 14 },

  limitWarning: {
    width: '100%', backgroundColor: '#FEF3C7', borderRadius: 10, padding: SPACING.sm,
    borderLeftWidth: 4, borderLeftColor: '#F59E0B',
  },
  limitWarningRed: { backgroundColor: '#FEE2E2', borderLeftColor: COLORS.danger },
  limitWarningText: { color: '#92400E', fontSize: 13, fontWeight: '500' },
  limitWarningTextRed: { color: '#991B1B' },
  limitWarningLink: { color: COLORS.primary, fontWeight: '700', fontSize: 13, marginTop: 4 },

  rsvpSection: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  rsvpTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.sm },
  rsvpButtons: { flexDirection: 'row', gap: SPACING.sm },
  rsvpButton: { flex: 1, backgroundColor: COLORS.input, borderRadius: 12, paddingVertical: SPACING.sm + 4, alignItems: 'center' },
  rsvpButtonActive: { backgroundColor: COLORS.primary },
  rsvpButtonText: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.text },
  rsvpButtonTextActive: { color: '#FFFFFF' },
  bottomSpacer: { height: SPACING.xl },
});