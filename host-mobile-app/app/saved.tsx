import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';

const API_URL = 'https://invitoinbox.onrender.com/api';

interface SavedInvitation {
  _id: string;
  title: string;
  eventDate: string;
  location?: string;
  coverImage?: string;
  host?: {
    name?: string;
    email?: string;
  };
}

export default function SavedScreen() {
  const router = useRouter();
  const [invitations, setInvitations] = useState<SavedInvitation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchSavedInvitations();
    }, [])
  );

  const fetchSavedInvitations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = await AsyncStorage.getItem('authToken');
      
      if (!token) {
        Alert.alert('Error', 'Please log in again');
        return;
      }

      const response = await axios.get(`${API_URL}/invitations/saved`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Safely access invitations array
      const fetchedInvitations = response.data?.invitations || [];
      if (fetchedInvitations.length > 0) {
        console.log("RAW SAVED DATA [FIRST ITEM]:", JSON.stringify(fetchedInvitations[0], null, 2));
      }
      setInvitations(fetchedInvitations);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to fetch saved invitations');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch saved invitations');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEventPress = (id: string) => {
    router.push(`/event/${id}`);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const renderEventCard = ({ item }: { item: SavedInvitation }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => handleEventPress(item._id)}
      activeOpacity={0.8}
    >
      {item.coverImage ? (
        <Image source={{ uri: item.coverImage }} style={styles.coverImage} />
      ) : (
        <View style={[styles.coverImage, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>📅</Text>
        </View>
      )}
      
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {item.title}
        </Text>
        
        <View style={styles.eventMetaRow}>
          <Text style={styles.eventIcon}>📅</Text>
          <Text style={styles.eventDate}>{formatDate(item.eventDate)}</Text>
        </View>
        
        {item.location && (
          <View style={styles.eventMetaRow}>
            <Text style={styles.eventIcon}>📍</Text>
            <Text style={styles.eventLocation} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        )}
        
        {item.host?.name && (
          <View style={styles.eventMetaRow}>
            <Text style={styles.eventIcon}>👤</Text>
            <Text style={styles.eventHost}>Hosted by {item.host.name}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📌</Text>
      <Text style={styles.emptyTitle}>No saved events yet</Text>
      <Text style={styles.emptySubtitle}>
        Events you save will appear here for easy access
      </Text>
      <TouchableOpacity
        style={styles.exploreButton}
        onPress={() => router.push('/dashboard')}
        activeOpacity={0.8}
      >
        <Text style={styles.exploreButtonText}>Explore Events</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Saved Events', headerShown: false }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading saved events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Saved Events', headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Events</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchSavedInvitations}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={invitations}
          renderItem={renderEventCard}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyState}
          refreshing={loading}
          onRefresh={fetchSavedInvitations}
        />
        
      )
      
      }
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
    padding: SPACING.lg,
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
  listContent: {
    padding: SPACING.md,
    flexGrow: 1,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.danger,
    marginBottom: SPACING.md,
    textAlign: 'center',
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
  // Event Card
  eventCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  coverImage: {
    width: '100%',
    height: 160,
    resizeMode: 'cover',
  },
  coverPlaceholder: {
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholderText: {
    fontSize: 48,
  },
  eventInfo: {
    padding: SPACING.md,
  },
  eventTitle: {
    ...TYPOGRAPHY.header,
    marginBottom: SPACING.sm,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventIcon: {
    fontSize: 14,
    marginRight: SPACING.xs,
  },
  eventDate: {
    ...TYPOGRAPHY.small,
    color: COLORS.primary,
    fontWeight: '500',
  },
  eventLocation: {
    ...TYPOGRAPHY.small,
    flex: 1,
  },
  eventHost: {
    ...TYPOGRAPHY.small,
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl * 2,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    ...TYPOGRAPHY.header,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  exploreButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.xl,
    borderRadius: 100,
  },
  exploreButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
