import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

export default function HomeScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Re-fetch data every time you land on this screen
  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [])
  );

  const fetchEvents = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        setLoading(false);
        return;
      }

      // Fetch all invitations (hosted and invited)
      const response = await axios.get(`${API_URL}/invitations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setEvents(Array.isArray(response.data) ? response.data : response.data.invitations || []);
    } catch (error) {
      console.error("Error fetching events:", error);
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const renderEventCard = ({ item }: { item: any }) => {
    if (!item) return null;

    const eventDate = new Date(item.eventDate).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric' 
    });

    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => router.push(`/event/${item._id}`)}
      >
        {item.coverImage ? (
          <Image source={{ uri: item.coverImage }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.placeholderImage]}>
            <Text style={{ fontSize: 32 }}>📅</Text>
          </View>
        )}
        
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title || 'Untitled Event'}</Text>
          
          <View style={styles.row}>
            <Text style={styles.icon}>📅</Text>
            <Text style={styles.infoText}>{eventDate}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.icon}>📍</Text>
            <Text style={styles.infoText} numberOfLines={1}>{item.location || 'Location TBD'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <Stack.Screen options={{ title: 'My Events', headerShown: true }} />
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'My Events', 
          headerShown: true,
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/create')} style={{ marginRight: 15 }}>
              <Ionicons name="add-circle" size={28} color="#4F46E5" />
            </TouchableOpacity>
          )
        }} 
      />
      
      <FlatList
        data={events}
        keyExtractor={(item, index) => item?._id ? item._id.toString() : index.toString()}
        renderItem={renderEventCard}
        contentContainerStyle={events.length === 0 ? styles.emptyList : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>No Events Yet</Text>
            <Text style={styles.emptyText}>
              You don't have any upcoming events. Tap the + icon to create your first invitation.
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyList: { flex: 1, justifyContent: 'center' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 3, overflow: 'hidden',
  },
  cardImage: { width: '100%', height: 160, resizeMode: 'cover' },
  placeholderImage: { backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  cardContent: { padding: 16 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  icon: { fontSize: 14, marginRight: 6 },
  infoText: { fontSize: 14, color: '#4B5563', flex: 1 },
  emptyContainer: { alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  emptyText: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
});