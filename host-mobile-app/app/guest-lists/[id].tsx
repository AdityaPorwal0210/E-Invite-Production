import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Contacts from 'expo-contacts';
import Toast from 'react-native-toast-message';

import api from '../../utils/api';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';

// Presets — the host can also type a custom value
const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Mr. & Mrs.', 'Shri', 'Smt.', 'Sh. & Smt.'];
const SUFFIXES = ['& Family', 'and Family', '& Co.'];

interface Guest {
  _id: string;
  name?: string;
  salutation?: string;
  suffix?: string;
  email?: string;
  phone?: string;
  expectedCount?: number;
  user?: string | null;
}

interface GuestList {
  _id: string;
  name: string;
  description?: string;
  guests: Guest[];
}

const emptyForm = {
  salutation: '',
  name: '',
  suffix: '',
  email: '',
  phone: '',
  expectedCount: '1',
};

// Mirrors the backend so the preview matches the real invite
const composeDisplayName = (g: { salutation?: string; name?: string; suffix?: string }) =>
  [g.salutation, g.name, g.suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

export default function GuestListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [list, setList] = useState<GuestList | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Live suggestions from existing app users AND the phone's contacts
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Device contacts are loaded once (lazily) and cached in this ref
  const contactsRef = useRef<any[] | null>(null);

  // Load device contacts (shared by the type-ahead search and the full picker).
  // Returns the mapped list; silent [] if permission is denied.
  const loadContacts = useCallback(async (force = false): Promise<any[]> => {
    if (!force && contactsRef.current !== null) return contactsRef.current;
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        contactsRef.current = contactsRef.current || [];
        return contactsRef.current;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
      });
      contactsRef.current = (data || [])
        .map((c) => ({
          _id: `contact_${c.id}`,
          source: 'contact',
          name: c.name || 'Unknown',
          phoneNumber: c.phoneNumbers?.[0]?.number || '',
          email: c.emails?.[0]?.email || '',
        }))
        .filter((c) => c.name && (c.phoneNumber || c.email))
        .sort((a, b) => a.name.localeCompare(b.name));
      return contactsRef.current;
    } catch (err) {
      contactsRef.current = contactsRef.current || [];
      return contactsRef.current;
    }
  }, []);

  const runSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    try {
      setSearching(true);

      // App users (server) and phone contacts (local)
      await loadContacts();
      const userRes = await api
        .get(`/users/search?query=${encodeURIComponent(q)}`)
        .catch(() => ({ data: [] }));

      const appUsers = (Array.isArray(userRes.data) ? userRes.data : []).map((u: any) => ({
        ...u,
        source: 'app',
      }));

      const needle = q.toLowerCase();
      const digits = q.replace(/[^0-9]/g, '');
      const last10 = (p: string) => { const d = (p || '').replace(/[^0-9]/g, ''); return d.length > 10 ? d.slice(-10) : d; };

      // Set of app-user emails/phones so we can drop contacts that ARE app users
      const appEmails = new Set(appUsers.map((u: any) => (u.email || '').toLowerCase()).filter(Boolean));
      const appPhones = new Set(
        appUsers.flatMap((u: any) => [last10(u.phoneNumber), last10(u.secondaryPhone)]).filter((d: string) => d.length === 10)
      );

      const contactMatches = (contactsRef.current || [])
        .filter((c) => {
          const nameHit = c.name.toLowerCase().includes(needle);
          const emailHit = c.email && c.email.toLowerCase().includes(needle);
          const phoneHit = digits.length >= 3 && c.phoneNumber.replace(/[^0-9]/g, '').includes(digits);
          return nameHit || emailHit || phoneHit;
        })
        // Drop any contact that is already an app user — show them once, as "app"
        .filter((c) => {
          const cEmail = (c.email || '').toLowerCase();
          const cPhone = last10(c.phoneNumber);
          if (cEmail && appEmails.has(cEmail)) return false;
          if (cPhone.length === 10 && appPhones.has(cPhone)) return false;
          return true;
        })
        .slice(0, 6);

      // App users first, then non-duplicate contacts; cap the combined list
      setSuggestions([...appUsers.slice(0, 6), ...contactMatches].slice(0, 8));
    } catch (err) {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, [loadContacts]);

  // Debounce the lookup so we don't hit the API on every keystroke
  const scheduleSearch = useCallback((query: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => runSearch(query), 300);
  }, [runSearch]);

  // True once the host picks an app account — drives the "linked" badge
  const [linkedToApp, setLinkedToApp] = useState(false);

  // Tapping a suggestion fills the form; app-user picks are flagged as linked
  const applySuggestion = (u: any) => {
    setForm((prev) => ({
      ...prev,
      name: u.name || prev.name,
      email: u.email && !u.email.includes('@placeholder.com') ? u.email : prev.email,
      phone: u.phoneNumber || u.secondaryPhone || prev.phone,
    }));
    setLinkedToApp(u.source === 'app');
    setSuggestions([]);
  };

  // --- FULL CONTACT PICKER (browse whole phonebook, multi-select) ---
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [pickerContacts, setPickerContacts] = useState<any[]>([]);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [addingContacts, setAddingContacts] = useState(false);

  const openContactPicker = async () => {
    setShowContactPicker(true);
    setPickerLoading(true);
    setPickerQuery('');
    setSelectedContactIds(new Set());
    const list = await loadContacts();
    setPickerContacts(list);
    setPickerLoading(false);
    if (list.length === 0) {
      Alert.alert('No contacts', 'Allow contacts access in Settings, or your phonebook is empty.');
    }
  };

  const toggleContactSelect = (contactId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      next.has(contactId) ? next.delete(contactId) : next.add(contactId);
      return next;
    });
  };

  const confirmAddContacts = async () => {
    const chosen = pickerContacts.filter((c) => selectedContactIds.has(c._id));
    if (chosen.length === 0) return;

    setAddingContacts(true);
    try {
      // Bulk add — backend links to app accounts and skips duplicates
      const guests = chosen.map((c) => ({
        name: c.name,
        phone: c.phoneNumber,
        email: c.email && !c.email.includes('@placeholder.com') ? c.email : '',
      }));
      const res = await api.post(`/guest-lists/${id}/guests`, { guests });
      Toast.show({ type: 'success', text1: res.data?.message || `Added ${guests.length} guests` });
      setShowContactPicker(false);
      fetchList();
    } catch (err: any) {
      // 409 when every chosen contact is already in the list
      Alert.alert(
        err?.response?.status === 409 ? 'Already in list' : 'Error',
        err?.response?.data?.message || 'Could not add the selected contacts'
      );
    } finally {
      setAddingContacts(false);
    }
  };

  const filteredPickerContacts = (() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return pickerContacts;
    const digits = q.replace(/[^0-9]/g, '');
    return pickerContacts.filter((c) => {
      const nameHit = c.name.toLowerCase().includes(q);
      const phoneHit = digits.length >= 2 && c.phoneNumber.replace(/[^0-9]/g, '').includes(digits);
      return nameHit || phoneHit;
    });
  })();

  const fetchList = useCallback(async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const response = await api.get(`/guest-lists/${id}`);
      setList(response.data);
      hasLoadedRef.current = true;
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load this list');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      fetchList();
    }, [fetchList])
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSuggestions([]);
    setLinkedToApp(false);
    setShowForm(true);
  };

  const openEdit = (guest: Guest) => {
    setEditingId(guest._id);
    setForm({
      salutation: guest.salutation || '',
      name: guest.name || '',
      suffix: guest.suffix || '',
      email: guest.email || '',
      phone: guest.phone || '',
      expectedCount: String(guest.expectedCount ?? 1),
    });
    setSuggestions([]);
    setLinkedToApp(Boolean(guest.user)); // already-linked guests show the badge
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setSuggestions([]);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  };

  const handleSave = async () => {
    if (!form.name.trim() && !form.email.trim() && !form.phone.trim()) {
      Alert.alert('Details needed', 'Add at least a name, email, or phone.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        expectedCount: Number(form.expectedCount) || 1,
      };

      if (editingId) {
        await api.put(`/guest-lists/${id}/guests/${editingId}`, payload);
        Toast.show({ type: 'success', text1: 'Guest updated' });
      } else {
        const response = await api.post(`/guest-lists/${id}/guests`, payload);
        Toast.show({ type: 'success', text1: response.data?.message || 'Guest added' });
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      fetchList();
    } catch (err: any) {
      // 409 = duplicate guest in this list
      if (err.response?.status === 409) {
        Alert.alert('Already in this list', err.response.data?.message || 'This guest is already on the list.');
      } else {
        Alert.alert('Error', err.response?.data?.message || 'Could not save guest');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (guest: Guest) => {
    Alert.alert(
      'Remove guest?',
      `${composeDisplayName(guest) || 'This guest'} will be removed from the list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/guest-lists/${id}/guests/${guest._id}`);
              Toast.show({ type: 'success', text1: 'Guest removed' });
              fetchList();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.message || 'Could not remove guest');
            }
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    try {
      const response = await api.get(`/guest-lists/${id}/export`, {
        responseType: 'text',
        transformResponse: [(data: any) => data],
      });

      const safeName = (list?.name || 'guest-list').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const fileUri = `${FileSystem.cacheDirectory}${safeName}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, response.data);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: `Export ${list?.name}` });
      } else {
        Alert.alert('Saved', `CSV saved to ${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not export this list');
    }
  };

  const renderGuest = ({ item }: { item: Guest }) => (
    <View style={styles.guestRow}>
      <View style={styles.guestInfo}>
        <View style={styles.guestNameRow}>
          <Text style={styles.guestName}>{composeDisplayName(item) || 'Unnamed guest'}</Text>
          {!!item.user && (
            <View style={styles.appBadge}>
              <Text style={styles.appBadgeText}>app</Text>
            </View>
          )}
        </View>
        <Text style={styles.guestContact}>
          {[item.email, item.phone].filter(Boolean).join(' · ') || 'No contact details'}
        </Text>
      </View>

      <View style={styles.guestActions}>
        <View style={styles.countChip}>
          <Text style={styles.countText}>{item.expectedCount ?? 1}</Text>
        </View>
        <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleRemove(item)} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const guests = list?.guests || [];
  const totalExpected = guests.reduce((sum, g) => sum + (g.expectedCount || 0), 0);
  const preview = composeDisplayName(form);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{list?.name}</Text>
          <Text style={styles.headerSub}>
            {guests.length} {guests.length === 1 ? 'guest' : 'guests'} · {totalExpected} expected
          </Text>
        </View>
        <TouchableOpacity onPress={handleExport} style={styles.iconBtn}>
          <Ionicons name="download-outline" size={22} color={COLORS.success} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={guests}
        keyExtractor={(item) => item._id}
        renderItem={renderGuest}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={fetchList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={56} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No guests yet</Text>
            <Text style={styles.emptyText}>Add your first guest to this list.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
              <Text style={styles.emptyBtnText}>+ Add Guest</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Add / edit guest modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={closeForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Guest' : 'Add Guest'}</Text>
              <TouchableOpacity onPress={closeForm}>
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.formScrollContent}
            >
              {/* Browse the whole phonebook and pick several at once */}
              {!editingId && (
                <TouchableOpacity style={styles.contactPickerBtn} onPress={openContactPicker}>
                  <Ionicons name="people" size={18} color="#FFFFFF" />
                  <Text style={styles.contactPickerBtnText}>Select multiple from Contacts</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.label}>Salutation</Text>
              <TextInput
                style={styles.input}
                value={form.salutation}
                onChangeText={(t) => setForm({ ...form, salutation: t })}
                placeholder="Mr. & Mrs."
                placeholderTextColor={COLORS.textMuted}
              />
              <View style={styles.chipRow}>
                {SALUTATIONS.map((s) => (
                  <TouchableOpacity key={s} style={styles.chip} onPress={() => setForm({ ...form, salutation: s })}>
                    <Text style={styles.chipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.labelRow}>
                <Text style={styles.label}>Name</Text>
                {linkedToApp && (
                  <View style={styles.linkedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                    <Text style={styles.linkedBadgeText}>Linked to app account</Text>
                  </View>
                )}
              </View>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(t) => { setForm({ ...form, name: t }); scheduleSearch(t); }}
                placeholder="Start typing to search existing guests"
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Live suggestions from existing app users */}
              {(searching || suggestions.length > 0) && (
                <View style={styles.suggestionBox}>
                  {searching && suggestions.length === 0 ? (
                    <Text style={styles.suggestionEmpty}>Searching…</Text>
                  ) : (
                    suggestions.map((u) => (
                      <TouchableOpacity
                        key={u._id}
                        style={styles.suggestionRow}
                        onPress={() => applySuggestion(u)}
                      >
                        <Ionicons
                          name={u.source === 'contact' ? 'call-outline' : 'person-circle-outline'}
                          size={22}
                          color={COLORS.primary}
                        />
                        <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                          <View style={styles.suggestionNameRow}>
                            <Text style={styles.suggestionName}>{u.name || 'Unnamed'}</Text>
                            <View style={[styles.sourceTag, u.source === 'contact' ? styles.sourceTagContact : styles.sourceTagApp]}>
                              <Text style={styles.sourceTagText}>
                                {u.source === 'contact' ? 'contact' : 'app'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.suggestionMeta} numberOfLines={1}>
                            {[u.email && !u.email.includes('@placeholder.com') ? u.email : null, u.phoneNumber]
                              .filter(Boolean)
                              .join(' · ') || 'App user'}
                          </Text>
                        </View>
                        <Ionicons name="add-circle" size={20} color={COLORS.success} />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              <Text style={styles.label}>Suffix</Text>
              <TextInput
                style={styles.input}
                value={form.suffix}
                onChangeText={(t) => setForm({ ...form, suffix: t })}
                placeholder="& Family"
                placeholderTextColor={COLORS.textMuted}
              />
              <View style={styles.chipRow}>
                {SUFFIXES.map((s) => (
                  <TouchableOpacity key={s} style={styles.chip} onPress={() => setForm({ ...form, suffix: s })}>
                    <Text style={styles.chipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!!preview && (
                <View style={styles.previewBox}>
                  <Text style={styles.previewLabel}>Invite will read</Text>
                  <Text style={styles.previewText}>Dear {preview}</Text>
                </View>
              )}

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={(t) => { setForm({ ...form, email: t }); setLinkedToApp(false); scheduleSearch(t); }}
                placeholder="guest@example.com"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={(t) => { setForm({ ...form, phone: t }); setLinkedToApp(false); scheduleSearch(t); }}
                placeholder="+91 98765 43210"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Expected people (host only)</Text>
              <TextInput
                style={styles.input}
                value={form.expectedCount}
                onChangeText={(t) => setForm({ ...form, expectedCount: t.replace(/[^0-9]/g, '') })}
                placeholder="1"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
              />

              <TouchableOpacity
                style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.primaryBtnText}>
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : '+ Add Guest'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full phonebook picker — multi-select */}
      <Modal visible={showContactPicker} animationType="slide" onRequestClose={() => setShowContactPicker(false)}>
        <SafeAreaView style={styles.pickerContainer} edges={['top', 'bottom']}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowContactPicker(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Select Contacts</Text>
            <Text style={styles.pickerCount}>{selectedContactIds.size} chosen</Text>
          </View>

          <View style={styles.pickerSearchWrap}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.pickerSearch}
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search name or number"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          {pickerLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading contacts…</Text>
            </View>
          ) : (
            <FlatList
              data={filteredPickerContacts}
              keyExtractor={(item) => item._id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 90 }}
              renderItem={({ item }) => {
                const checked = selectedContactIds.has(item._id);
                return (
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => toggleContactSelect(item._id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.pickerCheckbox, checked && styles.pickerCheckboxChecked]}>
                      {checked && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerName}>{item.name}</Text>
                      <Text style={styles.pickerMeta} numberOfLines={1}>
                        {[item.phoneNumber, item.email].filter(Boolean).join(' · ') || 'No details'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>
                  {pickerQuery ? 'No contacts match your search.' : 'No contacts found.'}
                </Text>
              }
            />
          )}

          {selectedContactIds.size > 0 && (
            <View style={styles.pickerFooter}>
              <TouchableOpacity
                style={[styles.primaryBtn, addingContacts && styles.primaryBtnDisabled, { marginTop: 0 }]}
                onPress={confirmAddContacts}
                disabled={addingContacts}
              >
                <Text style={styles.primaryBtnText}>
                  {addingContacts ? 'Adding…' : `Add ${selectedContactIds.size} to list`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.header },
  headerSub: { ...TYPOGRAPHY.small },
  addBtn: {
    backgroundColor: COLORS.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContent: { paddingHorizontal: SPACING.screenPadding, paddingBottom: SPACING.xl },

  guestRow: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.small,
  },
  guestInfo: { flex: 1, marginRight: SPACING.sm },
  guestNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestName: { ...TYPOGRAPHY.body, fontWeight: '600' },
  guestContact: { ...TYPOGRAPHY.small, marginTop: 2 },
  appBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  appBadgeText: { fontSize: 10, color: COLORS.success, fontWeight: '700' },

  guestActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  countChip: {
    backgroundColor: COLORS.primaryLight,
    minWidth: 26,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 4,
  },
  countText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  iconBtn: { padding: SPACING.xs },

  emptyState: { alignItems: 'center', paddingVertical: SPACING.xl * 2 },
  emptyTitle: { ...TYPOGRAPHY.header, marginTop: SPACING.md },
  emptyText: { ...TYPOGRAPHY.bodyMuted, marginTop: 4, marginBottom: SPACING.md },
  emptyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  modalTitle: { ...TYPOGRAPHY.header },

  formScrollContent: { paddingBottom: SPACING.xl },

  contactPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: '#0D9488',
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  contactPickerBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // --- Full contact picker modal ---
  pickerContainer: { flex: 1, backgroundColor: COLORS.background },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerCancel: { fontSize: 15, color: COLORS.textMuted },
  pickerTitle: { ...TYPOGRAPHY.header },
  pickerCount: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.input,
    marginHorizontal: SPACING.screenPadding,
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
  },
  pickerSearch: { flex: 1, paddingVertical: SPACING.sm, fontSize: 15, color: COLORS.text },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  pickerCheckboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pickerName: { ...TYPOGRAPHY.body, fontWeight: '600' },
  pickerMeta: { ...TYPOGRAPHY.small },
  pickerEmpty: { ...TYPOGRAPHY.bodyMuted, textAlign: 'center', padding: SPACING.xl },
  pickerFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm },
  linkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  linkedBadgeText: { fontSize: 11, color: COLORS.success, fontWeight: '600' },

  label: { ...TYPOGRAPHY.small, marginBottom: 4, marginTop: SPACING.sm },
  input: {
    backgroundColor: COLORS.input,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
  },

  suggestionBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  suggestionNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  suggestionName: { ...TYPOGRAPHY.body, fontWeight: '600' },
  suggestionMeta: { ...TYPOGRAPHY.small },
  suggestionEmpty: { ...TYPOGRAPHY.bodyMuted, padding: SPACING.sm },
  sourceTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  sourceTagApp: { backgroundColor: '#D1FAE5' },
  sourceTagContact: { backgroundColor: COLORS.primaryLight },
  sourceTagText: { fontSize: 10, fontWeight: '700', color: COLORS.text },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },

  previewBox: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.md,
  },
  previewLabel: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  previewText: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.primary, marginTop: 2 },

  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
