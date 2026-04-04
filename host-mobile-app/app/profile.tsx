import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  ScrollView,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';

const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

export default function ProfileScreen() {
  const router = useRouter();
  
  // States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // User Data
  const [user, setUser] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Fetch user data when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  const loadUserData = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const parsedUser = JSON.parse(userStr);
        setUser(parsedUser);
        setEditName(parsedUser.name || '');
        setEditPhone(parsedUser.phoneNumber || '');
      } else {
        // If no user is found, kick them to login
        router.replace('/');
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      return Alert.alert('Error', 'Name cannot be empty.');
    }

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      
      // Clean phone number (strip non-digits, keep + if present)
      const cleanPhone = editPhone ? editPhone.replace(/[^0-9+]/g, '') : '';

      const response = await axios.put(
        `${baseUrl}/users/profile`,
        { 
          name: editName,
          phoneNumber: cleanPhone
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // 1. Update local state
      const updatedUser = { ...user, ...response.data };
      setUser(updatedUser);
      
      // 2. Update AsyncStorage so the rest of the app sees the changes immediately
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      
      Alert.alert('Success', 'Profile updated successfully.');
      setIsEditing(false);
    } catch (err: any) {
      Alert.alert('Update Failed', err.response?.data?.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem('authToken');
            await AsyncStorage.removeItem('user');
            router.replace('/');
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary || '#4F46E5'} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Profile</Text>
          {!isEditing ? (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => {
              // Revert changes on cancel
              setEditName(user?.name || '');
              setEditPhone(user?.phoneNumber || '');
              setIsEditing(false);
            }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PROFILE CARD */}
        <View style={styles.card}>
          <View style={styles.avatarContainer}>
            {user?.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
              </View>
            )}
          </View>

          {/* EMAIL (Read-only since your backend requires OTP verification to change emails) */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Email Address</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{user?.email}</Text>
              {user?.isVerified && <Text style={styles.verifiedBadge}>✓ Verified</Text>}
            </View>
          </View>

          {/* NAME */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter your name"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.valueText}>{user?.name}</Text>
            )}
          </View>

          {/* PHONE NUMBER */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="e.g. +1234567890"
                keyboardType="phone-pad"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <View style={styles.readOnlyField}>
                <Text style={styles.valueText}>
                  {user?.phoneNumber || 'Not provided'}
                </Text>
                {user?.isPhoneVerified && <Text style={styles.verifiedBadge}>✓ Verified</Text>}
              </View>
            )}
          </View>

          {/* ACTION BUTTONS */}
          {isEditing && (
            <TouchableOpacity 
              style={styles.saveBtn} 
              onPress={handleSaveProfile} 
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* LOGOUT BUTTON */}
        {!isEditing && (
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background || '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: SPACING.screenPadding || 20 },
  
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 24 
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#111827' },
  editBtnText: { color: COLORS.primary || '#4F46E5', fontSize: 16, fontWeight: '600' },
  cancelBtnText: { color: '#6B7280', fontSize: 16, fontWeight: '600' },

  card: { 
    backgroundColor: '#FFF', 
    borderRadius: 16, 
    padding: 24, 
    ...(SHADOWS.card || { elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } })
  },
  
  avatarContainer: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: COLORS.primaryLight || '#E0E7FF', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  avatarText: { fontSize: 32, fontWeight: 'bold', color: COLORS.primary || '#4F46E5' },

  fieldContainer: { marginBottom: 20 },
  fieldLabel: { fontSize: 14, color: '#6B7280', marginBottom: 8, fontWeight: '500' },
  valueText: { fontSize: 16, color: '#111827', fontWeight: '500' },
  
  readOnlyField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readOnlyText: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  verifiedBadge: { fontSize: 12, color: '#10B981', backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, overflow: 'hidden', fontWeight: '600' },

  input: { 
    backgroundColor: '#F3F4F6', 
    borderRadius: 10, 
    paddingHorizontal: 16, 
    height: 48, 
    fontSize: 16, 
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },

  saveBtn: { 
    backgroundColor: COLORS.primary || '#4F46E5', 
    borderRadius: 10, 
    padding: 16, 
    alignItems: 'center', 
    marginTop: 8 
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

  logoutBtn: { 
    marginTop: 24, 
    padding: 16, 
    alignItems: 'center', 
    backgroundColor: '#FEF2F2', 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  logoutBtnText: { color: '#DC2626', fontSize: 16, fontWeight: 'bold' }
});