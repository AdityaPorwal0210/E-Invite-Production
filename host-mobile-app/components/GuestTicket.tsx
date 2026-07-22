import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import api from '../utils/api';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';

/**
 * Guest's QR entry pass, shown on their event view. The host scans it at the
 * gate to check them in. Renders nothing if the guest isn't on the list.
 */
export default function GuestTicket({ invitationId }: { invitationId: string }) {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/invitations/${invitationId}/my-ticket`);
      setTicket(res.data);
    } catch {
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [invitationId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !ticket) return null;

  // Once checked in, collapse to a small confirmation
  if (ticket.checkedIn) {
    return (
      <View style={styles.doneCard}>
        <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        <Text style={styles.checkedInText}>Checked in</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your entry pass</Text>
      <Text style={styles.subtitle}>Show this QR at the gate for check-in.</Text>

      <View style={styles.qrWrap}>
        <Image source={{ uri: ticket.qr }} style={styles.qr} contentFit="contain" />
      </View>

      {!!ticket.name && <Text style={styles.name}>{ticket.name}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  title: { ...TYPOGRAPHY.header },
  subtitle: { ...TYPOGRAPHY.bodyMuted, marginTop: 2, textAlign: 'center' },
  qrWrap: { backgroundColor: '#FFFFFF', padding: SPACING.sm, borderRadius: 12, marginTop: SPACING.md },
  qr: { width: 200, height: 200 },
  name: { ...TYPOGRAPHY.body, fontWeight: '700', marginTop: SPACING.sm },
  doneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  checkedInText: { color: COLORS.success, fontWeight: '700' },
});
