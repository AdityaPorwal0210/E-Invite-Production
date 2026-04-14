import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import axios from 'axios';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      // This assumes your backend has a route listening here
      await axios.post(`${baseUrl}/users/forgot-password`, { 
        email: email.toLowerCase().trim() 
      });
      
      setIsSent(true);
    } catch (error: any) {
      console.error("❌ Reset Error:", error.response?.data || error.message);
      Alert.alert(
        'Request Failed', 
        error.response?.data?.message || 'Failed to send reset email. Please try again later.'
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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>Reset Password</Text>
          
          {isSent ? (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={64} color={COLORS.success || '#10B981'} style={{ marginBottom: 16 }} />
              <Text style={styles.successText}>Check your email!</Text>
              <Text style={styles.subText}>
                We've sent password reset instructions to {email}. It may take a few minutes to arrive.
              </Text>
              <TouchableOpacity 
                style={styles.button} 
                // We push to the new screen and pass the email as a URL parameter
                onPress={() => router.push({ pathname: '/reset-password', params: { email } })}
              >
                <Text style={styles.buttonText}>Enter Verification Code</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formContainer}>
              <Text style={styles.subText}>
                Enter the email address associated with your account and we'll send you a link to reset your password.
              </Text>

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor={COLORS.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  backButton: {
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginLeft: SPACING.sm,
    width: 50,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.xl,
  },
  title: { ...TYPOGRAPHY.title, fontSize: 32, marginBottom: SPACING.md },
  subText: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginBottom: SPACING.xl, lineHeight: 24 },
  
  formContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.lg,
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
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },

  successContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  successText: { ...TYPOGRAPHY.header, fontSize: 24, marginBottom: SPACING.sm },
});