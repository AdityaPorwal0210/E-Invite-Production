import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import api from '../utils/api'; 

interface Props {
  invitationId: string;
  visible: boolean;
  onClose: () => void;
  onSuccess: (updatedInvitation: any) => void;
}

export default function PremiumUpgradeModal({ invitationId, visible, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);

    try {
      // 1. Get the Order ID from your backend
      const { data } = await api.post('/payments/create-order', { invitationId });

      const options = {
        description: 'Premium Event Upgrade',
        image: 'https://i.imgur.com/3g7nmJC.png', // Fallback logo
        currency: data.currency,
        key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID, // Ensure this is in your .env
        amount: data.amount,
        name: 'Invito',
        order_id: data.orderId,
        theme: { color: '#4F46E5' },
      };

      // 2. Open the Native Razorpay Checkout
      RazorpayCheckout.open(options)
        .then(async (response: any) => {
          // 3. Payment Succeeded on the phone. Verify it on the server.
          try {
            const verifyRes = await api.post('/payments/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              invitationId,
            });
            
            Alert.alert('Success', '🎉 Event upgraded to Premium!');
            onSuccess(verifyRes.data.invitation);
            onClose();
          } catch (verifyErr) {
            Alert.alert('Verification Failed', 'Payment processed, but verification failed. Contact support.');
          }
        })
        .catch((error: any) => {
          // Payment failed or user closed the modal
          Alert.alert('Payment Cancelled', `Error: ${error.description || 'User cancelled'}`);
        })
        .finally(() => {
          setLoading(false);
        });

    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to initiate payment.');
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.emoji}>⭐</Text>
          <Text style={styles.title}>Upgrade to Premium</Text>
          <Text style={styles.subtitle}>
            Your free event supports up to 50 guests.
          </Text>

          <View style={styles.priceBox}>
            <Text style={styles.price}>₹419</Text>
            <Text style={styles.priceLabel}> one-time per event</Text>
          </View>

          <TouchableOpacity
            style={[styles.upgradeBtn, loading && { opacity: 0.6 }]}
            onPress={handleUpgrade}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.upgradeBtnText}>Upgrade This Event</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#D1D5DB', borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  priceBox: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14, marginBottom: 20,
  },
  price: { fontSize: 32, fontWeight: '900', color: '#4F46E5' },
  priceLabel: { fontSize: 14, color: '#6B7280' },
  upgradeBtn: {
    backgroundColor: '#4F46E5', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  upgradeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { color: '#9CA3AF', fontSize: 14, fontWeight: '500' },
});