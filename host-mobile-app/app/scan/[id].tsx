import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import api from '../../utils/api';
import { COLORS, SPACING, TYPOGRAPHY } from '../../constants/theme';

type ScanResult = { status: 'ok' | 'already' | 'invalid'; name?: string; message: string } | null;

// expo-camera is a native module. On an older build that doesn't include it,
// requiring it throws — so we guard the require and degrade gracefully instead
// of crashing the whole app at route-load time.
let ExpoCamera: any = null;
try {
  ExpoCamera = require('expo-camera');
} catch (e) {
  ExpoCamera = null;
}

// Default export: guard the camera module, then render the real scanner.
export default function ScanScreen() {
  const router = useRouter();
  if (!ExpoCamera?.CameraView) {
    return (
      <SafeAreaView style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="camera-outline" size={56} color={COLORS.textMuted} />
        <Text style={styles.permTitle}>Update needed</Text>
        <Text style={styles.permText}>QR scanning needs the latest app build. Install the newest version, then try again.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={() => router.back()}>
          <Text style={styles.permBtnText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
  return <Scanner />;
}

function Scanner() {
  const { CameraView, useCameraPermissions } = ExpoCamera;
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [result, setResult] = useState<ScanResult>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<{ arrived: number; invited: number } | null>(null);
  // Prevents the camera firing the same code dozens of times per second
  const lockRef = useRef(false);

  // Reset the scan lock whenever the screen regains focus
  useFocusEffect(useCallback(() => { lockRef.current = false; setResult(null); }, []));

  const handleScan = async ({ data }: { data: string }) => {
    if (lockRef.current || busy) return;
    lockRef.current = true;
    setBusy(true);
    try {
      const res = await api.post(`/invitations/${id}/checkin`, { ticketId: data });
      const d = res.data;
      setResult({ status: d.status, name: d.name, message: d.message });
      if (d.status === 'ok') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCounts({ arrived: d.arrivedCount, invited: d.invitedCount });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setResult({ status: 'invalid', message: err.response?.data?.message || 'Ticket not recognised' });
    } finally {
      setBusy(false);
    }
  };

  const scanNext = () => { setResult(null); lockRef.current = false; };

  // Permission states
  if (!permission) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="camera-outline" size={56} color={COLORS.textMuted} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permText}>Allow camera access to scan guest QR codes.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant permission</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: SPACING.md }}>
          <Text style={{ color: COLORS.textMuted }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const resultColor = result?.status === 'ok' ? COLORS.success : result?.status === 'already' ? '#F59E0B' : COLORS.danger;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={result ? undefined : handleScan}
      />

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan Check-in</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Framing guide */}
      {!result && (
        <View style={styles.guideWrap} pointerEvents="none">
          <View style={styles.guideBox} />
          <Text style={styles.guideText}>Point at a guest's QR code</Text>
        </View>
      )}

      {/* Live count */}
      {counts && (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{counts.arrived} / {counts.invited} arrived</Text>
        </View>
      )}

      {/* Result overlay */}
      {result && (
        <SafeAreaView style={styles.resultOverlay} edges={['bottom']}>
          <View style={[styles.resultCard, { borderColor: resultColor }]}>
            <Ionicons
              name={result.status === 'ok' ? 'checkmark-circle' : result.status === 'already' ? 'alert-circle' : 'close-circle'}
              size={48}
              color={resultColor}
            />
            {!!result.name && <Text style={styles.resultName}>{result.name}</Text>}
            <Text style={[styles.resultMsg, { color: resultColor }]}>{result.message}</Text>
            <TouchableOpacity style={styles.scanNextBtn} onPress={scanNext}>
              <Text style={styles.scanNextText}>Scan next</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}

      {busy && (
        <View style={styles.busyOverlay}><ActivityIndicator size="large" color="#FFFFFF" /></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, padding: SPACING.lg },
  permTitle: { ...TYPOGRAPHY.header, marginTop: SPACING.md },
  permText: { ...TYPOGRAPHY.bodyMuted, textAlign: 'center', marginTop: 4 },
  permBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: 8, marginTop: SPACING.lg },
  permBtnText: { color: '#FFFFFF', fontWeight: '700' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },

  guideWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  guideBox: { width: 240, height: 240, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 24 },
  guideText: { color: '#FFFFFF', marginTop: SPACING.md, fontSize: 15 },

  countPill: { position: 'absolute', top: 90, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: 16 },
  countText: { color: '#FFFFFF', fontWeight: '700' },

  resultOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACING.lg },
  resultCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 2, padding: SPACING.lg, alignItems: 'center' },
  resultName: { ...TYPOGRAPHY.header, marginTop: SPACING.sm },
  resultMsg: { fontSize: 15, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  scanNextBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, borderRadius: 8, marginTop: SPACING.md },
  scanNextText: { color: '#FFFFFF', fontWeight: '700' },

  busyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
});
