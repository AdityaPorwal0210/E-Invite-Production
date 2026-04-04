import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

interface PhoneSyncCardProps {
  onSyncSuccess: (newPhoneNumber?: string) => void;
}

export default function PhoneSyncCard({ onSyncSuccess }: PhoneSyncCardProps) {
  const [hideBanner, setHideBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [step, setStep] = useState(1); // 1 = Phone Input, 2 = OTP Input
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOTP = async () => {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) {
      return Alert.alert("Invalid Number", "Please enter a valid phone number.");
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      await axios.post(
        `${API_URL}/users/sync-phone/request`, 
        { phoneNumber: cleanPhone },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStep(2); // Move to OTP step
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      return Alert.alert("Wait", "Please enter the 6-digit code.");
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.post(
        `${API_URL}/users/sync-phone/verify`, 
        { otp },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update the local User object
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        userData.phoneNumber = response.data.phoneNumber;
        userData.isPhoneVerified = true;
        await AsyncStorage.setItem('user', JSON.stringify(userData));
      }

      Alert.alert("Success", "Phone verified! Your invitations are now synced.");
      setShowModal(false);
      onSyncSuccess(response.data.phoneNumber);
    } catch (err: any) {
      Alert.alert("Failed", err.response?.data?.message || "Invalid OTP code.");
    } finally {
      setLoading(false);
    }
  };

  // If the user clicks the X, the banner disappears entirely.
  if (hideBanner) return null;

  return (
    <>
      {/* 1. THE COMPACT NOTIFICATION BANNER */}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Missing invites? Link your phone.</Text>
        <TouchableOpacity style={styles.bannerBtn} onPress={() => setShowModal(true)}>
          <Text style={styles.bannerBtnText}>Sync</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setHideBanner(true)} style={styles.closeBtnContainer}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* 2. THE MODAL POPUP */}
      <Modal visible={showModal} animationType="fade" transparent={true}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {step === 1 ? "Sync Invitations" : "Confirm Number"}
            </Text>
            <Text style={styles.modalSub}>
              {step === 1 
                ? "Enter your number to claim invites sent via SMS/WhatsApp." 
                : `Enter the 6-digit code sent to ${phone}`}
            </Text>

            {step === 1 ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 9876543210"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  placeholderTextColor="#9CA3AF"
                />
                <View style={styles.row}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.submitBtn} onPress={handleRequestOTP} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Get OTP</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TextInput
                  style={[styles.input, { letterSpacing: 4, textAlign: 'center' }]}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  placeholderTextColor="#9CA3AF"
                />
                <View style={styles.row}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep(1)}>
                    <Text style={styles.cancelBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.submitBtn} onPress={handleVerifyOTP} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Verify</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Banner Styles
  banner: { 
    flexDirection: 'row', 
    backgroundColor: COLORS.primary || '#3730A3', 
    paddingVertical: 12, 
    paddingHorizontal: 16, 
    borderRadius: 8, 
    marginHorizontal: SPACING.screenPadding || 16, 
    marginBottom: 16, 
    alignItems: 'center',
    ...SHADOWS.card 
  },
  bannerText: { color: '#FFF', flex: 1, fontSize: 13, fontWeight: '500' },
  bannerBtn: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 12 },
  bannerBtnText: { color: COLORS.primary || '#3730A3', fontWeight: 'bold', fontSize: 12 },
  closeBtnContainer: { padding: 4 },
  closeBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: 'bold' },

  // Modal Styles
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', padding: 24, borderRadius: 16, ...SHADOWS.card },
  modalTitle: { ...TYPOGRAPHY.header, color: '#111827', marginBottom: 8 },
  modalSub: { ...TYPOGRAPHY.body, color: '#6B7280', marginBottom: 16 },
  input: { 
    backgroundColor: '#F3F4F6', 
    borderRadius: 10, 
    paddingHorizontal: 16, 
    height: 50, 
    fontSize: 16, 
    color: '#111827',
    marginBottom: 16 
  },
  row: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10 },
  cancelBtnText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: COLORS.primary || '#3730A3', borderRadius: 10 },
  submitBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
});