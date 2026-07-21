import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import api from '../utils/api';
import { pickAndCompressImages } from '../utils/imageHandler';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';

/**
 * Shows on a guest's event view only when the host has requested their ID.
 * Requires explicit consent, then uploads photos to the private (authenticated)
 * store. Nothing renders if no ID was requested.
 */
export default function GuestIdUpload({ invitationId }: { invitationId: string }) {
  const [state, setState] = useState<any>(null);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/invitations/${invitationId}/my-id-request`);
      setState(res.data);
      setConsent(res.data.consent || false);
    } catch {
      setState({ requested: false }); // not applicable
    }
  }, [invitationId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!consent) {
      Toast.show({ type: 'error', text1: 'Please agree before uploading' });
      return;
    }
    const images = await pickAndCompressImages(3);
    if (!images || images.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      images.forEach((img: any) => {
        formData.append('documents', { uri: img.uri, name: img.name, type: img.type } as any);
      });
      formData.append('consent', 'true');

      const res = await api.post(`/invitations/${invitationId}/id-documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Toast.show({ type: 'success', text1: 'ID uploaded securely' });
      setState((s: any) => ({ ...s, documents: res.data.documents || [] }));
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  if (!state || !state.requested) return null;

  const docs = state.documents || [];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.emoji}>🪪</Text>
        <Text style={styles.title}>The host has requested your ID</Text>
      </View>
      <Text style={styles.note}>
        {state.note || 'Used for your hotel booking. Stored securely — only the host can view it.'}
      </Text>

      {docs.length > 0 ? (
        <Text style={styles.submitted}>✓ ID submitted. Thank you!</Text>
      ) : (
        <View style={{ marginTop: SPACING.sm }}>
          <View style={styles.consentRow}>
            <Switch value={consent} onValueChange={setConsent} />
            <Text style={styles.consentText}>
              I agree to share a photo of my ID with the host for this event.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.uploadBtn, (!consent || uploading) && styles.uploadBtnDisabled]}
            onPress={handleUpload}
            disabled={!consent || uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="camera" size={18} color="#FFFFFF" />
                <Text style={styles.uploadBtnText}>Upload ID photo</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.hint}>You can add up to 3 photos (e.g. front and back).</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 20 },
  title: { ...TYPOGRAPHY.header, color: '#92400E', flex: 1 },
  note: { fontSize: 13, color: '#92400E', marginTop: 4 },
  submitted: { color: COLORS.success, fontWeight: '600', marginTop: SPACING.sm },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  consentText: { flex: 1, fontSize: 13, color: '#92400E' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 11, color: '#B45309', marginTop: 6 },
});
