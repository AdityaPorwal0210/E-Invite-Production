import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';
import PhoneSyncCard from '../components/PhoneSyncCard'; 

interface Event {
  _id: string;
  title?: string;
  eventDate?: string;
  location?: string;
  description?: string;
  coverImage?: string;
  user?: string;
  host?: {
    _id?: string;
  };
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api/invitations';

export default function Dashboard() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'hosting' | 'attending'>('hosting');
  
  // States for user data and sync
  const [userData, setUserData] = useState<any>(null);
  const [showSync, setShowSync] = useState<boolean>(false);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await AsyncStorage.getItem('authToken');
      
      if (!token) {
        router.replace('/');
        return;
      }

      // Get current user ID, data, and check verification status
      const userStr = await AsyncStorage.getItem('user');
      let myUserId: string | undefined;
      if (userStr) {
        try {
          const parsedUser = JSON.parse(userStr);
          setUserData(parsedUser);
          myUserId = parsedUser._id || parsedUser.id;
          setShowSync(!parsedUser.isPhoneVerified);
        } catch (e) {
          console.log('Failed to parse user data');
        }
      }

      const endpoint = viewMode === 'hosting' 
        ? API_URL 
        : `${API_URL}/received`;

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let fetchedEvents = response.data?.invitations || response.data?.data || response.data || [];
      
      if (viewMode === 'attending' && myUserId) {
        fetchedEvents = fetchedEvents.filter((event: Event) => {
          const eventOwnerId = event.user || event.host?._id;
          return eventOwnerId !== myUserId;
        });
      }
      
      setEvents(fetchedEvents);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        // === FIX 1: THE ZOMBIE KILL SWITCH ===
        if (err.response?.status === 401) {
          console.log("Dead token detected. Forcing logout.");
          await AsyncStorage.multiRemove(['authToken', 'user']);
          router.replace('/');
          return;
        }
        setError(err.response?.data?.message || 'Failed to fetch events');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch events');
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [viewMode])
  );

  const handleSyncSuccess = () => {
    setShowSync(false);
    fetchEvents(); 
  };

  const renderEventItem = ({ item }: { item: Event }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/event/${item._id}?mode=${viewMode}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.title || 'Untitled Event'}</Text>
        <Text style={styles.cardDate}>
          {item.eventDate ? new Date(item.eventDate).toLocaleDateString() : 'Date not set'}
        </Text>
        <Text style={styles.cardLocation}>{item.location || 'Location not set'}</Text>
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

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* === FIX 2: THE UNIFIED RENDER TREE === */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary || '#3730A3'} />
          <Text style={styles.loadingText}>Loading your events...</Text>
        </View>
      ) : (
        <>
          {/* 1. TOP HEADER (Title + Profile Icon) */}
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

          {/* 2. QUICK ACTIONS ROW */}
          <View style={styles.quickActionsContainer}>
            <TouchableOpacity style={styles.savedButton} onPress={() => router.push('/saved')}>
              <Text style={styles.savedButtonText}>📌 Saved</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/groups')}>
              <Text style={styles.primaryButtonText}>👥 Groups</Text>
            </TouchableOpacity>
          </View>

          {/* 3. HOSTING / ATTENDING TOGGLE */}
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
              style={[styles.pillButton, viewMode === 'attending' && styles.pillButtonActive]}
              onPress={() => setViewMode('attending')}
            >
              <Text style={[styles.pillButtonText, viewMode === 'attending' && styles.pillButtonTextActive]}>
                Attending
              </Text>
            </TouchableOpacity>
          </View>

          {/* SYNC CARD NOTIFICATION */}
          {showSync && <PhoneSyncCard onSyncSuccess={handleSyncSuccess} />}

          {/* EVENT LIST OR ERRORS */}
          {error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchEvents}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : events.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                {viewMode === 'hosting' ? 'You have not created any events.' : 'You have no upcoming event invitations.'}
              </Text>
              {viewMode === 'hosting' && (
                <Text style={styles.emptySubtext}>Create your first event to get started!</Text>
              )}
            </View>
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item._id}
              renderItem={renderEventItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
          
          {/* FLOATING ACTION BUTTON */}
          <TouchableOpacity style={styles.fab} onPress={() => router.push('/create')}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </>
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

  quickActionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  savedButton: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedButtonText: { color: '#D97706', fontWeight: 'bold', fontSize: 14 },
  primaryButton: {
    backgroundColor: COLORS.primary || '#3730A3',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },

  loadingText: { marginTop: 12, ...TYPOGRAPHY.body },
  errorText: { ...TYPOGRAPHY.body, color: COLORS.danger || '#DC2626', textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: COLORS.primary || '#3730A3', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  
  emptyText: { ...TYPOGRAPHY.header, marginBottom: 8, textAlign: 'center', color: '#374151' },
  emptySubtext: { ...TYPOGRAPHY.bodyMuted, textAlign: 'center' },
  
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
});