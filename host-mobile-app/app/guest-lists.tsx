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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';

import api from '../utils/api';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';

interface GuestListSummary {
  _id: string;
  name: string;
  description?: string;
  guestCount: number;
  totalExpected: number;
}

export default function GuestListsScreen() {
  const router = useRouter();

  const [lists, setLists] = useState<GuestListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false); // no full-screen spinner on refocus

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchLists = useCallback(async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      const response = await api.get('/guest-lists');
      setLists(response.data.lists || []);
      hasLoadedRef.current = true;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not load your guest lists');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLists();
    }, [fetchLists])
  );

  const handleCreate = async () => {
    if (!newName.trim()) {
      Alert.alert('Name required', 'Please give the list a name.');
      return;
    }

    setCreating(true);
    try {
      await api.post('/guest-lists', {
        name: newName.trim(),
        description: newDescription.trim(),
      });
      Toast.show({ type: 'success', text1: `"${newName.trim()}" created` });
      setNewName('');
      setNewDescription('');
      setShowCreate(false);
      fetchLists();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not create the list');
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (list: GuestListSummary) => {
    setBusyId(list._id);
    try {
      await api.post(`/guest-lists/${list._id}/duplicate`);
      Toast.show({ type: 'success', text1: `Copied "${list.name}"` });
      fetchLists();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not duplicate the list');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (list: GuestListSummary) => {
    Alert.alert(
      'Delete list?',
      `"${list.name}" and its ${list.guestCount} guest${list.guestCount === 1 ? '' : 's'} will be removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(list._id);
            try {
              await api.delete(`/guest-lists/${list._id}`);
              Toast.show({ type: 'success', text1: `Deleted "${list.name}"` });
              fetchLists();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.message || 'Could not delete the list');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  // Pull the CSV from the API and hand it to the native share sheet
  const handleExport = async (list: GuestListSummary) => {
    setBusyId(list._id);
    try {
      const response = await api.get(`/guest-lists/${list._id}/export`, {
        responseType: 'text',
        transformResponse: [(data: any) => data],
      });

      const safeName = list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'guest-list';
      const dir = FileSystem.cacheDirectory;
      const fileUri = `${dir}${safeName}.csv`;

      await FileSystem.writeAsStringAsync(fileUri, response.data);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Export ${list.name}`,
        });
      } else {
        Alert.alert('Saved', `CSV saved to ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Error', 'Could not export this list');
    } finally {
      setBusyId(null);
    }
  };

  const renderList = ({ item }: { item: GuestListSummary }) => (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() => router.push(`/guest-lists/${item._id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </View>

        {!!item.description && <Text style={styles.cardDescription}>{item.description}</Text>}

        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Ionicons name="people-outline" size={14} color={COLORS.primary} />
            <Text style={styles.statText}>
              {item.guestCount} {item.guestCount === 1 ? 'guest' : 'guests'}
            </Text>
          </View>
          <View style={styles.statChip}>
            <Ionicons name="person-add-outline" size={14} color={COLORS.primary} />
            <Text style={styles.statText}>{item.totalExpected} expected</Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleExport(item)}
          disabled={busyId === item._id}
        >
          <Ionicons name="download-outline" size={16} color={COLORS.success} />
          <Text style={[styles.actionText, { color: COLORS.success }]}>Export</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleDuplicate(item)}
          disabled={busyId === item._id}
        >
          <Ionicons name="copy-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.actionText}>Duplicate</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleDelete(item)}
          disabled={busyId === item._id}
        >
          <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
          <Text style={[styles.actionText, { color: COLORS.danger }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading guest lists...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guest Lists</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Reusable lists per function — Reception, DJ Night, After Party. Invite a whole list to any event.
      </Text>

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={lists}
        keyExtractor={(item) => item._id}
        renderItem={renderList}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={fetchLists}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="list-outline" size={56} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No guest lists yet</Text>
            <Text style={styles.emptyText}>
              Create a list to start collecting guests for a function.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.emptyBtnText}>+ New List</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Guest List</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>List name *</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Reception"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={styles.input}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="e.g. Close family and relatives"
              placeholderTextColor={COLORS.textMuted}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, creating && styles.primaryBtnDisabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              <Text style={styles.primaryBtnText}>{creating ? 'Creating...' : 'Create List'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { ...TYPOGRAPHY.bodyMuted, marginTop: SPACING.sm },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.title },
  addBtn: {
    backgroundColor: COLORS.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    ...TYPOGRAPHY.bodyMuted,
    paddingHorizontal: SPACING.screenPadding,
    marginBottom: SPACING.md,
  },

  errorBox: {
    backgroundColor: COLORS.dangerLight,
    marginHorizontal: SPACING.screenPadding,
    padding: SPACING.sm,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  errorText: { color: COLORS.danger, fontSize: 13 },

  listContent: { paddingHorizontal: SPACING.screenPadding, paddingBottom: SPACING.xl },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...TYPOGRAPHY.header, flex: 1 },
  cardDescription: { ...TYPOGRAPHY.bodyMuted, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },

  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: SPACING.xs },
  actionText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },

  emptyState: { alignItems: 'center', paddingVertical: SPACING.xl * 2 },
  emptyTitle: { ...TYPOGRAPHY.header, marginTop: SPACING.md },
  emptyText: { ...TYPOGRAPHY.bodyMuted, textAlign: 'center', marginTop: 4, marginBottom: SPACING.md },
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
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  modalTitle: { ...TYPOGRAPHY.header },

  label: { ...TYPOGRAPHY.small, marginBottom: 4, marginTop: SPACING.sm },
  input: {
    backgroundColor: COLORS.input,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
  },

  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
