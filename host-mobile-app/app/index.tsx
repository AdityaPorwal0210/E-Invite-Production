import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, FlatList, 
  Modal, TextInput, Alert, ActivityIndicator, ScrollView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';

const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync States
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncPhone, setSyncPhone] = useState('');
  const [syncOtp, setSyncOtp] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));

      const res = await axios.get(`${baseUrl}/invitations/my-invites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvitations(res.data);
    } catch (err) {
      console.log("Error fetching dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySync = async () => {
    if (!syncPhone || !syncOtp) return Alert.alert("Error", "Please fill all fields.");
    setIsSyncing(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      await axios.post(
        `${baseUrl}/users/sync-phone/verify`, 
        { phoneNumber: syncPhone, otp: syncOtp },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert("Success", "Account synced! Invites found.");
      setShowSyncModal(false);
      
      // Update local user state so card disappears
      const updatedUser = { ...user, isPhoneVerified: true, phoneNumber: syncPhone };
      setUser(updatedUser);
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      
      fetchDashboardData(); // Refresh list to show new invites
    } catch (err: any) {
      Alert.alert("Sync Failed", err.response?.data?.message || "Invalid OTP.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={TYPOGRAPHY.title}>Hello, {user?.name}!</Text>

        {/* IDENTITY SYNC CARD */}
        {!user?.isPhoneVerified && (
          <TouchableOpacity style={styles.syncCard} onPress={() => setShowSyncModal(true)}>
            <View style={styles.syncCardContent}>
              <Text style={styles.syncEmoji}>🎁</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.syncTitle}>Find Hidden Invites</Text>
                <Text style={styles.syncSub}>Link your phone to claim invites sent to you.</Text>
              </View>
              <Text style={styles.syncArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={[TYPOGRAPHY.header, { marginTop: 20 }]}>Your Invitations</Text>
        {invitations.length === 0 ? (
          <Text style={styles.emptyText}>No invitations yet.</Text>
        ) : (
          invitations.map((item: any) => (
            <View key={item._id} style={styles.inviteItem}>
              <Text style={TYPOGRAPHY.body}>{item.invitation?.title || 'Event'}</Text>
              <Text style={TYPOGRAPHY.small}>{item.rsvpStatus || 'Pending'}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* SYNC MODAL */}
      <Modal visible={showSyncModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Link Phone Number</Text>
            <Text style={TYPOGRAPHY.small}>Enter the number where you received an invite.</Text>
            
            <TextInput 
              style={styles.input} 
              placeholder="Phone Number" 
              value={syncPhone} 
              onChangeText={setSyncPhone} 
              keyboardType="phone-pad" 
            />
            <TextInput 
              style={styles.input} 
              placeholder="OTP (Use 123456)" 
              value={syncOtp} 
              onChangeText={setSyncOtp} 
              keyboardType="number-pad" 
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSyncModal(false)}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleVerifySync} disabled={isSyncing}>
                {isSyncing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Sync Now</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  syncCard: {
    backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginTop: 20,
    borderWidth: 1, borderColor: '#C7D2FE', ...SHADOWS.card,
  },
  syncCardContent: { flexDirection: 'row', alignItems: 'center' },
  syncEmoji: { fontSize: 24, marginRight: 12 },
  syncTitle: { fontWeight: 'bold', color: '#3730A3', fontSize: 16 },
  syncSub: { color: '#4338CA', fontSize: 12 },
  syncArrow: { fontSize: 20, color: '#6366F1' },
  inviteItem: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginTop: 10, ...SHADOWS.card },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textMuted },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', padding: 25, borderRadius: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  input: { backgroundColor: '#F3F4F6', padding: 15, borderRadius: 10, marginTop: 10, fontSize: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: '#E5E7EB', borderRadius: 10 },
  submitBtn: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 10 },
  submitBtnText: { color: '#FFF', fontWeight: 'bold' },
});