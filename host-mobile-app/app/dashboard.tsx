import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  AppState,
  ActivityIndicator,
  Linking,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';
import PhoneSyncCard from '../components/PhoneSyncCard';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import * as Notifications from 'expo-notifications';
import { cacheData, getCachedData, CACHE_KEYS } from '../utils/cache';
import EventCardSkeleton from '../components/EventCardSkeleton';

interface Event {
  _id: string;
  title?: string;
  eventDate?: string;
  location?: string;
  description?: string;
  coverImage?: string;
  user?: string;
  isRead?: boolean;
  host?: {
    _id?: string;
    name?: string;
  };
}

const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';
const API_URL = `${baseUrl}/invitations`;

export default function Dashboard() {
  const router = useRouter();
  
  // --- NOTIFICATION STATE ---
  const [notificationCounts, setNotificationCounts] = useState({ pendingInvites: 0 });
  const prevInvitesRef = useRef(0);

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'hosting' | 'attending'>('hosting');
  
  // --- SEARCH STATE ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);

  const [pushPermissionDenied, setPushPermissionDenied] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [showSync, setShowSync] = useState<boolean>(false);

  // --- BACKGROUND POLLING & REFRESH ---
  const fetchCounts = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return;
      const response = await axios.get(`${baseUrl}/users/notifications/counts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotificationCounts(response.data);
    } catch (err) { }
  }, []);

  useEffect(() => {
    fetchCounts(); 
    const interval = setInterval(fetchCounts, 30000); 
    return () => clearInterval(interval);
  }, [fetchCounts]);

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Date not set';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // --- LOCAL DEBOUNCED SEARCH FILTER ---
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredEvents(events);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      const lowercasedQuery = searchQuery.toLowerCase();
      
      const filtered = events.filter((event) => {
        const titleMatch = event.title?.toLowerCase().includes(lowercasedQuery);
        const locationMatch = event.location?.toLowerCase().includes(lowercasedQuery);
        const hostMatch = event.host?.name?.toLowerCase().includes(lowercasedQuery);
        const formattedDate = formatDateTime(event.eventDate).toLowerCase();
        const dateMatch = formattedDate.includes(lowercasedQuery);

        return titleMatch || locationMatch || hostMatch || dateMatch;
      });
      
      setFilteredEvents(filtered);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, events]);

  // --- TOAST TRIGGER ---
  useEffect(() => {
    const currentCount = notificationCounts.pendingInvites || 0;
    
    if (currentCount > prevInvitesRef.current) {
      Toast.show({
        type: 'success',
        text1: '🎉 New Invitation!',
        text2: `You have ${currentCount} pending event invitations waiting for you.`,
        position: 'top',
        visibilityTime: 4000,
      });
    }
    prevInvitesRef.current = currentCount;
  }, [notificationCounts.pendingInvites]);

  const checkPermissionsAndGetToken = async () => {
    try {
      const authToken = await AsyncStorage.getItem('authToken');
      if (!authToken) return;

      const expoPushToken = await registerForPushNotificationsAsync();
      
      if (expoPushToken) {
        setPushPermissionDenied(false); 
        await axios.put(
          `${baseUrl}/users/push-token`,
          { expoPushToken },
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
      } else {
        setPushPermissionDenied(true); 
      }
    } catch (error) {
      console.error("❌ Failed to setup push notifications:", error);
    }
  };

  useEffect(() => {
    checkPermissionsAndGetToken();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        checkPermissionsAndGetToken();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data && data.invitationId) {
        router.push(`/event/${data.invitationId}?mode=attending`);
      }
    });
    return () => subscription.remove();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        router.replace('/');
        return;
      }

      const userStr = await AsyncStorage.getItem('user');
      let myUserId: string | undefined;
      if (userStr) {
        try {
          const parsedUser = JSON.parse(userStr);
          setUserData(parsedUser);
          myUserId = parsedUser._id || parsedUser.id;
          setShowSync(!parsedUser.isPhoneVerified);
        } catch (e) { }
      }

      const endpoint = viewMode === 'hosting' ? API_URL : `${API_URL}/received`;
      const cacheKey = viewMode === 'hosting' ? CACHE_KEYS.INVITATIONS : CACHE_KEYS.INVITATIONS_RECEIVED;

      const NetInfo = require('@react-native-community/netinfo').default;
      const networkState = await NetInfo.fetch();

      if (!networkState.isConnected) {
        const cachedEvents = await getCachedData(cacheKey);
        
        if (cachedEvents) {
          let eventsToShow = cachedEvents;
          if (viewMode === 'attending' && myUserId) {
            eventsToShow = cachedEvents.filter((event: any) => {
              const eventOwnerId = event.user || event.host?._id;
              return eventOwnerId !== myUserId;
            });
          }
          setEvents(eventsToShow);
        } else {
          setError('No internet connection and no cached data available.');
        }
        setLoading(false);
        return; 
      }

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000, 
      });

      let fetchedEvents = response.data?.invitations || response.data?.data || response.data || [];
      
      if (viewMode === 'attending' && myUserId) {
        fetchedEvents = fetchedEvents.filter((event: any) => {
          const eventOwnerId = event.user || event.host?._id;
          return eventOwnerId !== myUserId;
        });
      }
      
      await cacheData(cacheKey, fetchedEvents);
      setEvents(fetchedEvents);

    } catch (err: any) {
      if (err.response?.status === 401) {
        await AsyncStorage.multiRemove(['authToken', 'user']);
        router.replace('/');
        return;
      }
      
      if (err.code === 'ECONNABORTED' || !err.response) {
        const cacheKey = viewMode === 'hosting' ? CACHE_KEYS.INVITATIONS : CACHE_KEYS.INVITATIONS_RECEIVED;
        const cachedEvents = await getCachedData(cacheKey);
        if (cachedEvents) {
          setEvents(cachedEvents);
        } else {
           setError('Network request failed and no cache available.');
        }
      } else {
        setError(err.response?.data?.message || 'Failed to fetch events');
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
      fetchCounts();
    }, [viewMode, fetchCounts])
  );

  const handleSyncSuccess = () => {
    setShowSync(false);
    fetchEvents(); 
  };

  const renderEventItem = ({ item }: { item: Event }) => {
    const isNew = viewMode === 'attending' && item.isRead === false;

    return (
      <TouchableOpacity
        style={[
          styles.card, 
          isNew && { borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: '#F0F4FF' }
        ]}
        onPress={() => router.push(`/event/${item._id}?mode=${viewMode}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={[styles.cardTitle, { flexShrink: 1 }]} numberOfLines={1}>
              {item.title || 'Untitled Event'}
            </Text>
            {isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
          </View>
          
          <Text style={styles.cardDate}>
            {formatDateTime(item.eventDate)}
          </Text>
          <Text style={styles.cardLocation} numberOfLines={1}>
            {item.location || 'Location not set'}
          </Text>
        </View>
        
        <View style={styles.cardImageContainer}>
          {item.coverImage ? (
            <Image source={{ uri: item.coverImage }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={styles.cardImagePlaceholder}>
              <Text style={styles.cardImagePlaceholderText}>📅</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Events</Text>
        
        <TouchableOpacity 
          style={styles.profileAvatarBtn} 
          onPress={() => router.push('/profile')}
        >
          {userData?.profileImage ? (
            <Image source={{ uri: userData.profileImage }} style={styles.profileImage} />
          ) : (
            <View style={styles.profileInitials}>
              <Text style={styles.profileInitialsText}>
                {userData?.name ? userData.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {pushPermissionDenied && (
        <TouchableOpacity 
          style={styles.warningBanner}
          onPress={() => Linking.openSettings()}
        >
          <Text style={styles.warningText}>
            ⚠️ Notifications are disabled! Tap here to open Settings and turn them on to receive event invites.
          </Text>
        </TouchableOpacity>
      )}

      {/* COMBINED ACTION ROW: Search + Saved + Groups */}
      <View style={styles.actionRow}>
        <View style={styles.compactSearchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events, hosts, dates..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        <TouchableOpacity 
          style={styles.savedIconButton} 
          onPress={() => router.push('/saved')}
          activeOpacity={0.7}
        >
          <Ionicons name="bookmark" size={20} color="#D97706" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.groupIconButton} 
          onPress={() => router.push('/groups')}
          activeOpacity={0.7}
        >
          <Ionicons name="people" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.pillButton, viewMode === 'hosting' && styles.pillButtonActive]}
          onPress={() => setViewMode('hosting')}
        >
          <Text style={[styles.pillButtonText, viewMode === 'hosting' && styles.pillButtonTextActive]}>
            Hosting
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.pillButton, 
            viewMode === 'attending' && styles.pillButtonActive,
            { position: 'relative' } 
          ]}
          onPress={() => setViewMode('attending')}
        >
          <Text style={[styles.pillButtonText, viewMode === 'attending' && styles.pillButtonTextActive]}>
            Attending
          </Text>
          
          {notificationCounts.pendingInvites > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notificationCounts.pendingInvites}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {showSync && <PhoneSyncCard onSyncSuccess={handleSyncSuccess} />}

      {loading ? (
        <View style={{ flex: 1, marginTop: 10 }}>
          <EventCardSkeleton />
          <EventCardSkeleton />
          <EventCardSkeleton />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchEvents}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredEvents.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateIconContainer}>
            <Ionicons 
              name={viewMode === 'hosting' ? "calendar-outline" : "search-outline"} 
              size={64} 
              color={COLORS.primary || '#3730A3'} 
              style={{ opacity: 0.8 }}
            />
          </View>
          <Text style={styles.emptyStateTitle}>
            {searchQuery ? "No matching events" : (viewMode === 'hosting' ? "Let's get started!" : "You're all caught up.")}
          </Text>
          <Text style={styles.emptyStateSubtext}>
            {searchQuery 
              ? `We couldn't find anything matching "${searchQuery}".`
              : (viewMode === 'hosting' 
                ? "Create your first event to send out stunning invitations and track your RSVPs in real-time." 
                : "When hosts invite you to their events, they will magically appear right here.")}
          </Text>
          
          {viewMode === 'hosting' && !searchQuery && (
            <TouchableOpacity 
              style={styles.emptyStateButton}
              onPress={() => router.push('/create')}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.emptyStateButtonText}>Create Your First Event</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item._id}
          renderItem={renderEventItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      
      {!loading && events.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/create')}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background || '#F9FAFB',
    paddingHorizontal: SPACING.screenPadding || 16,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
  },
  headerTitle: { ...TYPOGRAPHY.title, fontSize: 28, fontWeight: 'bold', color: '#111827' },
  
  profileAvatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  profileImage: { width: '100%', height: '100%' },
  profileInitials: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileInitialsText: { fontSize: 18, fontWeight: 'bold', color: '#4338CA' },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  compactSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: '#111827',
  },
  savedIconButton: {
    backgroundColor: '#FEF3C7',
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupIconButton: {
    backgroundColor: COLORS.primary || '#3730A3',
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  warningBanner: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginBottom: 16,
  },
  warningText: {
    color: '#991B1B',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 14,
  },

  loadingText: { marginTop: 12, ...TYPOGRAPHY.body },
  errorText: { ...TYPOGRAPHY.body, color: COLORS.danger || '#DC2626', textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: COLORS.primary || '#3730A3', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  
  listContent: { paddingBottom: 80 }, 
  
  card: {
    backgroundColor: COLORS.card || '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...(SHADOWS.card || { elevation: 2, shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }),
  },
  cardContent: { flex: 1, marginRight: 16 },
  cardTitle: { ...TYPOGRAPHY.header, marginBottom: 4, fontSize: 18, color: '#111827' },
  cardDate: { ...TYPOGRAPHY.bodyMuted, color: COLORS.primary || '#3730A3', fontWeight: '600', marginBottom: 4 },
  cardLocation: { ...TYPOGRAPHY.bodyMuted, color: '#6B7280' },
  
  cardImageContainer: { width: 80, height: 80 },
  cardImage: { width: 80, height: 80, borderRadius: 12 },
  cardImagePlaceholder: { width: 80, height: 80, borderRadius: 12, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center' },
  cardImagePlaceholderText: { fontSize: 32 },
  
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary || '#3730A3',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: { color: '#FFFFFF', fontSize: 32, fontWeight: '300', marginTop: -2 },
  
  toggleRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 12, backgroundColor: '#E5E7EB', borderRadius: 100, padding: 4 },
  pillButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 100 },
  pillButtonActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  pillButtonText: { ...TYPOGRAPHY.body, color: '#6B7280', fontWeight: '600' },
  pillButtonTextActive: { color: COLORS.primary || '#3730A3' },

  badge: {
    position: 'absolute',
    top: -4,
    right: 12,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#E5E7EB', 
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  newBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  newBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 40, 
  },
  emptyStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    ...TYPOGRAPHY.title,
    fontSize: 24,
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    ...TYPOGRAPHY.body,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emptyStateButton: {
    backgroundColor: COLORS.primary || '#3730A3',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    ...(SHADOWS.card || { elevation: 2, shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }),
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});