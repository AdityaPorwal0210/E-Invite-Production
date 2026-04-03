import React, { useCallback, useState, useEffect } from 'react'; // Added useEffect
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
import PhoneSyncCard from '../components/PhoneSyncCard'; // <--- IMPORT THE NEW CARD

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

const API_URL = 'https://invitoinbox.onrender.com/api/invitations';

export default function Dashboard() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'hosting' | 'attending'>('hosting');
  
  // NEW: State to control visibility of the sync card
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

      // Get current user ID and check verification status
      const userStr = await AsyncStorage.getItem('user');
      let myUserId: string | undefined;
      if (userStr) {
        try {
          const userData = JSON.parse(userStr);
          myUserId = userData._id || userData.id;
          
          // NEW: Only show sync card if phone is NOT verified
          setShowSync(!userData.isPhoneVerified);
        } catch (e) {
          console.log('Failed to parse user data');
        }
      }

      const endpoint = viewMode === 'hosting' 
        ? API_URL 
        : `${API_URL}/received`;

      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    fetchEvents(); // Refresh list to show newly merged invitations
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('user');
    router.replace('/');
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
          <Image
            source={{ uri: item.coverImage }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Text style={styles.cardImagePlaceholderText}>📅</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'My Events', headerShown: false }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading your events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'My Events', headerShown: false }} />
      
      {/* Header logic remains same */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Events</Text>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.savedButton} onPress={() => router.push('/saved')}>
            <Text style={styles.savedButtonText}>📌 Saved</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/groups')}>
            <Text style={styles.primaryButtonText}>Groups</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
            <Text style={styles.dangerButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
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
          style={[styles.pillButton, viewMode === 'attending' && styles.pillButtonActive]}
          onPress={() => setViewMode('attending')}
        >
          <Text style={[styles.pillButtonText, viewMode === 'attending' && styles.pillButtonTextActive]}>
            Attending
          </Text>
        </TouchableOpacity>
      </View>

      {/* Conditionally render the PhoneSyncCard */}
      {showSync && <PhoneSyncCard onSyncSuccess={handleSyncSuccess} />}

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
      
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/create')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.screenPadding,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    ...TYPOGRAPHY.title,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  savedButton: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  savedButtonText: {
    color: '#D97706',
    fontWeight: 'bold',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dangerButton: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  loadingText: {
    marginTop: SPACING.sm,
    ...TYPOGRAPHY.body,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.danger,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 4,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyText: {
    ...TYPOGRAPHY.header,
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodyMuted,
    textAlign: 'center',
  },
  listContent: {
    paddingVertical: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  cardContent: {
    flex: 1,
    marginRight: SPACING.md,
  },
  cardTitle: {
    ...TYPOGRAPHY.header,
    marginBottom: SPACING.xs,
  },
  cardDate: {
    ...TYPOGRAPHY.bodyMuted,
    color: COLORS.primary,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  cardLocation: {
    ...TYPOGRAPHY.bodyMuted,
    marginBottom: SPACING.xs,
  },
  cardImageContainer: {
    width: 80,
    height: 80,
  },
  cardImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  cardImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImagePlaceholderText: {
    fontSize: 32,
  },
  fab: {
    position: 'absolute',
    bottom: SPACING.lg,
    right: SPACING.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
    marginTop: -2,
  },
  // Toggle styles - Pill Style
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: SPACING.md,
  },
  pillButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'transparent',
    borderRadius: 100,
    marginHorizontal: SPACING.xs,
  },
  pillButtonActive: {
    backgroundColor: COLORS.primary,
  },
  pillButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  pillButtonTextActive: {
    color: COLORS.card,
  },
});
