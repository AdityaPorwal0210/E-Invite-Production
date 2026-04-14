import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  // Automatically grab the email passed from the previous screen
  const { email } = useLocalSearchParams<{ email: string }>();
  
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!otp.trim() || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      // 🚨 WARNING: Ensure this matches your backend's expected payload exactly
      await axios.post(`${baseUrl}/users/reset-password`, {
        email: email,
        otp: otp.trim(),
        newPassword: newPassword,
      });

      Toast.show({
        type: 'success',
        text1: 'Password Reset Successful!',
        text2: 'You can now log in with your new password.',
        position: 'top',
      });

      // Kick them back to the login screen
      router.replace('/');
      
    } catch (error: any) {
      console.error("❌ Reset Error:", error.response?.data || error.message);
      Alert.alert(
        'Reset Failed', 
        error.response?.data?.message || 'Invalid OTP or failed to reset password.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Create New Password</Text>
            <Text style={styles.subText}>
              Enter the OTP sent to <Text style={{fontWeight: 'bold', color: COLORS.primary}}>{email}</Text> and choose a new password.
            </Text>
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.inputLabel}>Verification Code (OTP)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter 6-digit code"
              placeholderTextColor={COLORS.textMuted}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.inputLabel}>New Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new password"
              placeholderTextColor={COLORS.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Confirm New Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={COLORS.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: SPACING.xl },
  backButton: {
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginLeft: SPACING.sm,
    width: 50,
  },
  header: {
    paddingHorizontal: SPACING.screenPadding,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  title: { ...TYPOGRAPHY.title, fontSize: 32, marginBottom: SPACING.sm },
  subText: { ...TYPOGRAPHY.body, color: COLORS.textMuted, lineHeight: 24 },
  
  formContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.lg,
    marginHorizontal: SPACING.screenPadding,
    ...SHADOWS.card,
  },
  inputLabel: { ...TYPOGRAPHY.small, fontWeight: '600', marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border || '#E5E7EB',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});