import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';

const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';

export default function RegisterScreen() {
  const router = useRouter();
  
  // Step Management
  const [step, setStep] = useState<1 | 2>(1); // 1 = Details, 2 = Email OTP
  const [loading, setLoading] = useState<boolean>(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  
  // OTP State
  const [otp, setOtp] = useState('');

  // STEP 1: Register User
  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${baseUrl}/users/register`, {
        name,
        email: email.toLowerCase().trim(),
        password,
        phoneNumber // Triggers your backend Recycle Protocol!
      });

      if (response.data.requiresOTP) {
        setStep(2);
        Alert.alert('Success', 'Check your email for the verification code.');
      } else {
        // Fallback just in case backend changes
        Alert.alert('Unexpected Response', 'Please try logging in.');
        router.replace('/');
      }
    } catch (error: any) {
      console.error('Registration Error:', error?.response?.data || error);
      Alert.alert('Registration Failed', error.response?.data?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify Email OTP
  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit code sent to your email.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${baseUrl}/users/verify-otp`, {
        email: email.toLowerCase().trim(),
        otp
      });

      // OTP Verified! Log them in automatically.
      await AsyncStorage.setItem('authToken', response.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      
      Alert.alert('Welcome!', 'Your account has been created successfully.');
      router.replace('/dashboard');

    } catch (error: any) {
      console.error('OTP Error:', error?.response?.data || error);
      Alert.alert('Verification Failed', error.response?.data?.message || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.headerContainer}>
            <Text style={styles.title}>
              {step === 1 ? "Create Account" : "Verify Email"}
            </Text>
            <Text style={styles.subtitle}>
              {step === 1 
                ? "Sign up to start hosting and managing events." 
                : `We sent a 6-digit code to ${email}`}
            </Text>
          </View>

          {/* Form Container */}
          <View style={styles.formContainer}>
            
            {step === 1 ? (
              // --- STEP 1: REGISTRATION FORM ---
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor={COLORS.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                />
                
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={COLORS.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Phone Number (Optional)"
                  placeholderTextColor={COLORS.textMuted}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                />
                <Text style={styles.helperText}>
                  Enter the number you received an SMS invite on to link your RSVPs.
                </Text>

                <TextInput
                  style={[styles.input, { marginTop: SPACING.sm }]}
                  placeholder="Password"
                  placeholderTextColor={COLORS.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleRegister}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>Sign Up</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.7}>
                    <Text style={styles.signInLink}>Sign In</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              // --- STEP 2: OTP FORM ---
              <>
                <TextInput
                  style={[styles.input, { letterSpacing: 8, textAlign: 'center', fontSize: 24 }]}
                  placeholder="000000"
                  placeholderTextColor={COLORS.textMuted}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleVerifyOTP}
                  disabled={loading || otp.length !== 6}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>Verify & Login</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={{ marginTop: SPACING.lg, alignItems: 'center' }} 
                  onPress={() => setStep(1)}
                >
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                    ← Back to Registration
                  </Text>
                </TouchableOpacity>
              </>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.lg,
  },
  headerContainer: {
    marginBottom: SPACING.xl,
  },
  title: {
    ...TYPOGRAPHY.title,
    fontSize: 32,
    marginBottom: 8,
  },
  subtitle: {
    ...TYPOGRAPHY.bodyMuted,
    marginBottom: SPACING.xl,
  },
  formContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: SPACING.md,
    marginTop: -8,
    paddingHorizontal: 4,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  footerText: {
    ...TYPOGRAPHY.body,
    color: '#6B7280',
  },
  signInLink: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: 'bold',
  },
});