import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';

const API_URL = 'https://invitoinbox.onrender.com/api';

interface PhoneSyncCardProps {
  onSyncSuccess: (newPhoneNumber: string) => void;
}

export default function PhoneSyncCard({ onSyncSuccess }: PhoneSyncCardProps) {
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

      // 1. Update the local User object in AsyncStorage
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        userData.phoneNumber = response.data.phoneNumber;
        userData.isPhoneVerified = true;
        await AsyncStorage.setItem('user', JSON.stringify(userData));
      }

      Alert.alert("Success", "Phone verified! Your invitations are now synced.");
      onSyncSuccess(response.data.phoneNumber);
    } catch (err: any) {
      Alert.alert("Failed", err.response?.data?.message || "Invalid OTP code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {step === 1 ? "Missing Invitations?" : "Confirm Your Number"}
      </Text>
      <Text style={styles.subtitle}>
        {step === 1 
          ? "Link your phone number to see invites sent via SMS." 
          : `Enter the 6-digit code sent to ${phone}`}
      </Text>

      {step === 1 ? (
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="e.g. 9876543210"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity style={styles.button} onPress={handleRequestOTP} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Get OTP</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { letterSpacing: 4, textAlign: 'center' }]}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={setOtp}
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity style={styles.button} onPress={handleVerifyOTP} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>
        </View>
      )}
      
      {step === 2 && (
        <TouchableOpacity onPress={() => setStep(1)} style={{ marginTop: 10 }}>
          <Text style={{ color: COLORS.primary, fontSize: 12, textAlign: 'center' }}>Change Number</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F0F4FF', // Light Indigo
    margin: SPACING.md,
    padding: SPACING.lg,
    borderRadius: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.card,
  },
  title: { ...TYPOGRAPHY.body, fontWeight: 'bold', color: '#1E1B4B' },
  subtitle: { ...TYPOGRAPHY.small, color: '#4338CA', marginBottom: 12, marginTop: 2 },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 48,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    ...TYPOGRAPHY.body,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});