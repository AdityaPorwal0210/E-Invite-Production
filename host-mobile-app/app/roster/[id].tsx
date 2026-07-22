import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal, Alert,
  ActivityIndicator, StyleSheet, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';

import api from '../../utils/api';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';

const PRESET_TAGS = ['VIP', "Bride's side", "Groom's side", 'Needs hotel', 'Family', 'Friends'];
type Filter = 'All' | 'Going' | 'Pending' | 'Arrived';

export default function AttendeeRosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [guests, setGuests] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [idEnabled, setIdEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  // Broadcast compose
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [bcastMsg, setBcastMsg] = useState('');
  const [bcastAudience, setBcastAudience] = useState<'all' | 'going' | 'pending'>('all');
  const [sending, setSending] = useState(false);

  // Manage sheet (opened by tapping a guest)
  const [managing, setManaging] = useState<any>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [expectedDraft, setExpectedDraft] = useState('1');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const res = await api.get(`/invitations/${id}/guests`);
      setGuests(res.data.guests || []);
      setStats(res.data.stats || null);
      setIdEnabled(res.data.idCollectionEnabled || false);
      hasLoadedRef.current = true;
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load the roster');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ---- per-guest actions (all inside the manage sheet) ----
  const openManage = (guest: any) => {
    setManaging(guest);
    setTagDraft(guest.tags || []);
    setCustomTag('');
    setExpectedDraft(String(guest.expectedCount ?? 1));
  };
  const gid = (g: any) => g?.recipient?._id || g?._id;

  const toggleTag = (t: string) => setTagDraft(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
  const addCustomTag = () => { const t = customTag.trim(); if (t && !tagDraft.includes(t)) setTagDraft([...tagDraft, t]); setCustomTag(''); };

  const saveManage = async () => {
    const guestId = gid(managing);
    setSaving(true);
    try {
      await api.put(`/invitations/${id}/guests/${guestId}/tags`, { tags: tagDraft });
      const count = Number(expectedDraft);
      if (Number.isFinite(count) && count !== managing.expectedCount) {
        await api.put(`/invitations/${id}/guests/${guestId}/expected`, { expectedCount: count });
      }
      Toast.show({ type: 'success', text1: 'Guest updated' });
      setManaging(null);
      load();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const requestId = async (guest: any) => {
    try {
      await api.post(`/invitations/${id}/guests/${gid(guest)}/request-id`, {});
      Toast.show({ type: 'success', text1: 'ID requested' });
      setManaging(null); load();
    } catch (err: any) {
      Alert.alert(err.response?.data?.requiresUpgrade ? 'Premium feature' : 'Error', err.response?.data?.message || 'Could not request ID');
    }
  };

  const cancelIdRequest = (guest: any) => {
    Alert.alert('Cancel ID request', 'Cancel the ID request for this guest?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, cancel', style: 'destructive', onPress: async () => {
        try {
          await api.post(`/invitations/${id}/guests/${gid(guest)}/cancel-id-request`, {});
          Toast.show({ type: 'success', text1: 'ID request cancelled' });
          setManaging(null); load();
        } catch (err: any) {
          Alert.alert('Error', err.response?.data?.message || 'Could not cancel');
        }
      } },
    ]);
  };
  const viewDoc = async (guestId: string, docId: string) => {
    try {
      const res = await api.get(`/invitations/${id}/guests/${guestId}/id-documents/${docId}/view`);
      if (res.data?.url) Linking.openURL(res.data.url);
    } catch { Alert.alert('Error', 'Could not open document'); }
  };
  const deleteDoc = async (guestId: string, docId: string) => {
    try { await api.delete(`/invitations/${id}/guests/${guestId}/id-documents/${docId}`); Toast.show({ type: 'success', text1: 'Deleted' }); load(); }
    catch { Alert.alert('Error', 'Could not delete'); }
  };

  const toggleCheckIn = async (guest: any) => {
    const guestId = gid(guest);
    try {
      if (guest.checkedIn) await api.post(`/invitations/${id}/checkin/undo`, { guestId });
      else await api.post(`/invitations/${id}/checkin`, { guestId });
      setManaging(null); load();
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Check-in failed'); }
  };

  const removeGuest = (guest: any) => {
    Alert.alert('Remove guest', 'Remove this guest from the event?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.delete(`/invitations/${id}/guests/${gid(guest)}`); setManaging(null); load(); }
        catch { Alert.alert('Error', 'Could not remove'); }
      } },
    ]);
  };

  const sendBroadcast = async () => {
    if (!bcastMsg.trim()) { Alert.alert('Message needed', 'Type a message to send.'); return; }
    setSending(true);
    try {
      const res = await api.post(`/invitations/${id}/broadcast`, { message: bcastMsg.trim(), audience: bcastAudience });
      Toast.show({ type: 'success', text1: res.data?.message || 'Message sent' });
      setShowBroadcast(false);
      setBcastMsg('');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const remindPending = async () => {
    try {
      const res = await api.post(`/invitations/${id}/remind-pending`);
      Toast.show({ type: 'success', text1: res.data?.message || 'Reminders sent' });
    } catch (err: any) {
      if (err.response?.status === 429) Toast.show({ type: 'info', text1: err.response.data?.message });
      else Alert.alert('Error', err.response?.data?.message || 'Could not send reminders');
    }
  };

  const requestNeedsHotel = async () => {
    try {
      const res = await api.post(`/invitations/${id}/request-id-by-tag`, { tag: 'Needs hotel' });
      Toast.show({ type: 'success', text1: res.data?.message || 'IDs requested' });
      load();
    } catch (err: any) {
      Alert.alert(err.response?.data?.requiresUpgrade ? 'Premium feature' : 'Error', err.response?.data?.message || 'Could not request IDs');
    }
  };

  const exportCsv = async () => {
    try {
      const esc = (s: any) => { const v = s == null ? '' : String(s); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
      const rows = guests.map((g: any) => [
        esc(g.recipient?.name || ''), esc(g.recipient?.email || ''),
        esc(g.rsvpStatus === 'accepted' ? 'Going' : g.rsvpStatus === 'declined' ? 'Declined' : 'Pending'),
        esc(g.checkedIn ? 'Yes' : 'No'), esc(g.expectedCount ?? 1), esc((g.tags || []).join('; ')),
      ].join(','));
      const csv = ['Name,Email,RSVP,Arrived,Expected,Tags', ...rows].join('\n');
      const uri = `${FileSystem.cacheDirectory}attendees.csv`;
      await FileSystem.writeAsStringAsync(uri, csv);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export attendees' });
    } catch { Alert.alert('Error', 'Could not export'); }
  };

  const filtered = guests.filter((g: any) => {
    const name = (g.recipient?.name || '').toLowerCase();
    const email = (g.recipient?.email || '').toLowerCase();
    const q = search.toLowerCase();
    if (q && !name.includes(q) && !email.includes(q)) return false;
    if (filter === 'Going') return g.rsvpStatus === 'accepted';
    if (filter === 'Pending') return g.rsvpStatus !== 'accepted' && g.rsvpStatus !== 'declined';
    if (filter === 'Arrived') return g.checkedIn;
    return true;
  });

  const anyNeedsHotel = guests.some((g: any) => (g.tags || []).includes('Needs hotel'));

  const renderGuest = ({ item }: { item: any }) => {
    const name = item.recipient?.name || 'Guest';
    const rsvp = item.rsvpStatus;
    return (
      <TouchableOpacity style={styles.row} onPress={() => openManage(item)} activeOpacity={0.6}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name}>{[item.salutation, name, item.suffix].filter(Boolean).join(' ')}</Text>
          {(item.tags || []).length > 0 ? (
            <View style={styles.tagRow}>
              {item.tags.slice(0, 3).map((t: string) => (
                <View key={t} style={styles.tagChip}><Text style={styles.tagChipText}>{t}</Text></View>
              ))}
            </View>
          ) : (
            <Text style={styles.sub}>{item.recipient?.email || `${item.expectedCount ?? 1} expected`}</Text>
          )}

          {/* Direct ID action next to the name */}
          {idEnabled && (
            (item.idDocuments || []).length > 0 ? (
              <TouchableOpacity onPress={() => viewDoc(gid(item), item.idDocuments[0]._id)}>
                <Text style={styles.idView}>🔒 ID submitted · view</Text>
              </TouchableOpacity>
            ) : item.idRequest?.requested ? (
              <TouchableOpacity onPress={() => cancelIdRequest(item)}>
                <Text style={styles.idPendingRow}>⏳ ID requested · tap to cancel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.idReqBtn} onPress={() => requestId(item)}>
                <Ionicons name="id-card-outline" size={15} color={COLORS.primary} />
                <Text style={styles.idReqText}>Request ID</Text>
              </TouchableOpacity>
            )
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[styles.pill, rsvp === 'accepted' && styles.pillGoing, rsvp === 'declined' && styles.pillNo, (!rsvp || rsvp === 'tentative') && styles.pillPending]}>
            <Text style={styles.pillText}>{rsvp === 'accepted' ? 'Going' : rsvp === 'declined' ? 'No' : 'Pending'}</Text>
          </View>
          {item.checkedIn && <Text style={styles.arrived}>✓ Arrived</Text>}
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;
  }

  const m = managing;
  const mDocs = m?.idDocuments || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Attendee roster</Text>
          {stats && <Text style={styles.headerSub}>{stats.accepted} going · {stats.pending} pending · {stats.arrived} arrived</Text>}
        </View>
        <TouchableOpacity onPress={exportCsv} style={styles.iconBtn}><Ionicons name="download-outline" size={22} color={COLORS.success} /></TouchableOpacity>
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/scan/${id}`)}>
          <Ionicons name="qr-code-outline" size={18} color={COLORS.primary} />
          <Text style={styles.actionText}>Scan check-in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowBroadcast(true)}>
          <Ionicons name="megaphone-outline" size={18} color={COLORS.primary} />
          <Text style={styles.actionText}>Message all</Text>
        </TouchableOpacity>
        {stats?.pending > 0 && (
          <TouchableOpacity style={styles.actionBtn} onPress={remindPending}>
            <Ionicons name="notifications-outline" size={18} color={COLORS.primary} />
            <Text style={styles.actionText}>Remind</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search name or email" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" />
      </View>

      <View style={styles.filterRow}>
        {(['All', 'Going', 'Pending', 'Arrived'] as Filter[]).map(f => (
          <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipOn]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => gid(item) || String(i)}
        renderItem={renderGuest}
        contentContainerStyle={{ paddingHorizontal: SPACING.screenPadding, paddingBottom: SPACING.xl }}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={<Text style={styles.empty}>No guests match.</Text>}
        ListFooterComponent={idEnabled && anyNeedsHotel ? (
          <TouchableOpacity style={styles.needsHotelBtn} onPress={requestNeedsHotel}>
            <Text style={styles.needsHotelText}>🪪 Request IDs from everyone tagged "Needs hotel"</Text>
          </TouchableOpacity>
        ) : null}
      />

      {/* Broadcast compose */}
      <Modal visible={showBroadcast} transparent animationType="slide" onRequestClose={() => setShowBroadcast(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Message guests</Text>
              <TouchableOpacity onPress={() => setShowBroadcast(false)}><Ionicons name="close" size={24} color={COLORS.textMuted} /></TouchableOpacity>
            </View>

            <Text style={styles.label}>Send to</Text>
            <View style={styles.filterRow}>
              {(['all', 'going', 'pending'] as const).map(a => (
                <TouchableOpacity key={a} style={[styles.filterChip, bcastAudience === a && styles.filterChipOn]} onPress={() => setBcastAudience(a)}>
                  <Text style={[styles.filterText, bcastAudience === a && styles.filterTextOn]}>
                    {a === 'all' ? 'Everyone' : a === 'going' ? 'Going' : 'Not responded'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={bcastMsg}
              onChangeText={setBcastMsg}
              placeholder="e.g. The venue has changed to The Grand Hall. See you there!"
              placeholderTextColor={COLORS.textMuted}
              multiline
            />
            <Text style={styles.bcastHint}>Sent as a push notification and email.</Text>

            <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary, marginTop: SPACING.lg }, sending && { opacity: 0.6 }]} onPress={sendBroadcast} disabled={sending}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{sending ? 'Sending...' : 'Send message'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Manage sheet */}
      <Modal visible={!!managing} transparent animationType="slide" onRequestClose={() => setManaging(null)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{m?.recipient?.name || 'Guest'}</Text>
              <TouchableOpacity onPress={() => setManaging(null)}><Ionicons name="close" size={24} color={COLORS.textMuted} /></TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Check-in */}
              <TouchableOpacity style={[styles.sheetAction, m?.checkedIn && { backgroundColor: '#FEE2E2' }]} onPress={() => toggleCheckIn(m)}>
                <Ionicons name={m?.checkedIn ? 'close-circle-outline' : 'checkmark-circle-outline'} size={20} color={m?.checkedIn ? COLORS.danger : COLORS.success} />
                <Text style={[styles.sheetActionText, { color: m?.checkedIn ? COLORS.danger : COLORS.success }]}>
                  {m?.checkedIn ? 'Undo check-in' : 'Check in (arrived)'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.label}>Tags</Text>
              <View style={styles.tagWrap}>
                {PRESET_TAGS.map(t => {
                  const on = tagDraft.includes(t);
                  return <TouchableOpacity key={t} style={[styles.selTag, on && styles.selTagOn]} onPress={() => toggleTag(t)}><Text style={[styles.selTagText, on && styles.selTagTextOn]}>{t}</Text></TouchableOpacity>;
                })}
                {tagDraft.filter(t => !PRESET_TAGS.includes(t)).map(t => (
                  <TouchableOpacity key={t} style={[styles.selTag, styles.selTagOn]} onPress={() => toggleTag(t)}><Text style={styles.selTagTextOn}>{t} ✕</Text></TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: 6 }}>
                <TextInput style={[styles.input, { flex: 1 }]} value={customTag} onChangeText={setCustomTag} placeholder="Add custom tag" placeholderTextColor={COLORS.textMuted} />
                <TouchableOpacity style={styles.addBtn} onPress={addCustomTag}><Text style={{ fontWeight: '700', color: COLORS.text }}>Add</Text></TouchableOpacity>
              </View>

              <Text style={styles.label}>Expected people (host only)</Text>
              <TextInput style={styles.input} value={expectedDraft} onChangeText={t => setExpectedDraft(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="1" placeholderTextColor={COLORS.textMuted} />

              {/* ID collection */}
              {idEnabled && (
                <>
                  <Text style={styles.label}>ID for hotel</Text>
                  {mDocs.length > 0 ? (
                    <View style={styles.tagWrap}>
                      {mDocs.map((d: any) => (
                        <View key={d._id} style={styles.docChip}>
                          <TouchableOpacity onPress={() => viewDoc(gid(m), d._id)}><Text style={styles.docView}>🔒 {d.label || 'View'}</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteDoc(gid(m), d._id)}><Text style={styles.docDel}>✕</Text></TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : m?.idRequest?.requested ? (
                    <TouchableOpacity style={styles.sheetAction} onPress={() => cancelIdRequest(m)}>
                      <Ionicons name="close-circle-outline" size={20} color={COLORS.danger} />
                      <Text style={[styles.sheetActionText, { color: COLORS.danger }]}>Cancel ID request</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.sheetAction} onPress={() => requestId(m)}>
                      <Ionicons name="id-card-outline" size={20} color={COLORS.primary} />
                      <Text style={[styles.sheetActionText, { color: COLORS.primary }]}>Request ID</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary, marginTop: SPACING.lg }, saving && { opacity: 0.6 }]} onPress={saveManage} disabled={saving}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{saving ? 'Saving...' : 'Save changes'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.removeRow} onPress={() => removeGuest(m)}>
                <Text style={styles.removeText}>Remove from event</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.screenPadding, paddingVertical: SPACING.md },
  iconBtn: { padding: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.header },
  headerSub: { ...TYPOGRAPHY.small },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.screenPadding, marginBottom: SPACING.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primaryLight, borderRadius: 8, paddingVertical: SPACING.sm },
  actionText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.input, marginHorizontal: SPACING.screenPadding, paddingHorizontal: SPACING.md, borderRadius: 8, marginBottom: SPACING.sm },
  search: { flex: 1, paddingVertical: SPACING.sm, fontSize: 15, color: COLORS.text },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: SPACING.screenPadding, marginBottom: SPACING.sm },
  filterChip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.input },
  filterChipOn: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  filterTextOn: { color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 10, padding: SPACING.sm, marginBottom: SPACING.sm, ...SHADOWS.small },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.primary, fontWeight: '700' },
  name: { ...TYPOGRAPHY.body, fontWeight: '600' },
  sub: { ...TYPOGRAPHY.small },
  tagRow: { flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  tagChip: { backgroundColor: '#CCFBF1', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  tagChipText: { fontSize: 10, color: '#0F766E', fontWeight: '600' },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: COLORS.input },
  pillGoing: { backgroundColor: '#D1FAE5' }, pillNo: { backgroundColor: '#FEE2E2' }, pillPending: { backgroundColor: '#FEF3C7' },
  pillText: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  arrived: { fontSize: 10, color: COLORS.success, fontWeight: '700' },
  idReqBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6, backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  idReqText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  idPendingRow: { color: '#B45309', fontSize: 13, fontWeight: '600', marginTop: 6, paddingVertical: 2 },
  idView: { color: COLORS.success, fontSize: 13, fontWeight: '600', marginTop: 6, paddingVertical: 2 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: SPACING.xl },
  needsHotelBtn: { backgroundColor: COLORS.primaryLight, borderRadius: 8, padding: SPACING.sm, marginTop: SPACING.sm, alignItems: 'center' },
  needsHotelText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, maxHeight: '88%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  sheetTitle: { ...TYPOGRAPHY.header },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.input, borderRadius: 8, padding: SPACING.md, marginTop: SPACING.sm },
  sheetActionText: { fontWeight: '700', fontSize: 14 },
  label: { ...TYPOGRAPHY.small, marginTop: SPACING.md, marginBottom: 4 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border },
  selTagOn: { backgroundColor: '#0D9488', borderColor: '#0D9488' },
  selTagText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  selTagTextOn: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
  input: { backgroundColor: COLORS.input, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 15, color: COLORS.text },
  addBtn: { backgroundColor: COLORS.input, borderRadius: 8, paddingHorizontal: SPACING.md, justifyContent: 'center' },
  docChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.input, borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  docView: { color: COLORS.primary, fontWeight: '600' },
  docDel: { color: COLORS.danger, fontWeight: '700' },
  idPending: { color: '#B45309', fontSize: 13 },
  button: { borderRadius: 8, paddingVertical: SPACING.md, alignItems: 'center' },
  removeRow: { alignItems: 'center', padding: SPACING.md, marginBottom: SPACING.md },
  removeText: { color: COLORS.danger, fontWeight: '600' },
  bcastHint: { ...TYPOGRAPHY.small, marginTop: 6 },
});
