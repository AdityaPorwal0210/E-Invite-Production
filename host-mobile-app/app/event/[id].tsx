import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, 
  StyleSheet, Alert, Linking, TextInput, FlatList, Modal, Share
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { pickAndCompressImages } from '@/utils/imageHandler';
import * as Haptics from 'expo-haptics';

import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { io } from 'socket.io-client';
import Toast from 'react-native-toast-message';

import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';
import ImageCarousel from '../../components/ImageCarousel';
import { generateGoogleCalendarLink } from '../../utils/calendar';
import { optimizeCloudinaryUrl } from '../../utils/optimizeImage';

// 🚨 INJECTED NATIVE MODAL
import PremiumUpgradeModal from '../../components/PremiumUpgradeModal';
import GuestIdUpload from '../../components/GuestIdUpload';
import GuestTicket from '../../components/GuestTicket';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://invitoinbox.onrender.com/api';
const BASE_URL = API_URL.replace('/api', '');
const FREE_GUEST_LIMIT = 50;

const PRESET_TAGS = ['VIP', "Bride's side", "Groom's side", 'Needs hotel', 'Family', 'Friends'];

// Authorised header helper for the management calls
const authHeaders = async () => {
  const token = await AsyncStorage.getItem('authToken');
  return { Authorization: `Bearer ${token}` };
};

interface Attachment {
  uri: string;
  name: string;
  type: string;
}

export default function EventDetailsHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [invitation, setInvitation] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [guests, setGuests] = useState<any[]>([]);
  const [eventStats, setEventStats] = useState<any>(null); // headcount totals (host)
  const [idEnabled, setIdEnabled] = useState(false); // ID collection available (premium or paywall off)
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false); // avoid full-screen spinner on refocus
  const [myRsvp, setMyRsvp] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  
  const [isSaved, setIsSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [googleMapsLink, setGoogleMapsLink] = useState<string>('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);

  const [authCheckComplete, setAuthCheckComplete] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // --- Group Blast State ---
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [invitingGroup, setInvitingGroup] = useState<string | null>(null);

  // --- Guest management (tags / expected / ID) ---
  const [managingGuest, setManagingGuest] = useState<any>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [expectedDraft, setExpectedDraft] = useState('1');
  const [savingManage, setSavingManage] = useState(false);

  // --- Search Guest State ---
  const [searchQuery, setSearchQuery] = useState('');

  // --- CO-HOST / DELEGATE STATE ---
  const [showCoHostModal, setShowCoHostModal] = useState(false);
  const [coHostSearch, setCoHostSearch] = useState('');
  const [coHostResults, setCoHostResults] = useState<any[]>([]);
  const [selectedCoHosts, setSelectedCoHosts] = useState<any[]>([]);
  const [savingCoHosts, setSavingCoHosts] = useState(false);
  const coHostSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🚨 PAYWALL STATE
  const [paywallActive, setPaywallActive] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  console.log('🚀 EVENT HUB MOUNTED. ID:', id);

  const checkAuthAndFetch = useCallback(async () => {
    try {
      // Spinner only on first load; refocus refreshes silently behind the existing content
      if (!hasLoadedRef.current) setLoading(true);
      const token = await AsyncStorage.getItem('authToken');

      if (!token) {
        setAuthCheckComplete(true);
        setLoading(false);
        await AsyncStorage.setItem('pendingRoute', `/event/${id}`);
        router.replace('/');
        return;
      }

      const userStr = await AsyncStorage.getItem('user');
      let currentId = null;
      if (userStr) {
        const userData = JSON.parse(userStr);
        currentId = userData._id || userData.id;
        setCurrentUserId(currentId);
      }

      const headers = { Authorization: `Bearer ${token}` };

      // ⚡ STALE-WHILE-REVALIDATE: show the cached event instantly (even when online),
      // then let the network fetch below refresh it. Makes reopening an event feel instant.
      try {
        const cachedEventStr = await AsyncStorage.getItem(`cache_event_${id}`);
        if (cachedEventStr) {
          const cachedEvent = JSON.parse(cachedEventStr);
          setInvitation(cachedEvent);

          const cOwner = cachedEvent.host?._id || cachedEvent.user;
          const cIsHost = currentId === cOwner || (cachedEvent.delegates || []).some((d: any) =>
            (typeof d === 'string' ? d : d._id) === currentId);
          setIsHost(cIsHost);
          if (cachedEvent.videoUrl) setVideoUrl(cachedEvent.videoUrl);
          if (cachedEvent.googleMapsLink) setGoogleMapsLink(cachedEvent.googleMapsLink);
          if (!cIsHost && cachedEvent.myRsvp) setMyRsvp(cachedEvent.myRsvp);
          if (cachedEvent.isSaved !== undefined) setIsSaved(cachedEvent.isSaved);

          const cachedGuestsStr = await AsyncStorage.getItem(`cache_guests_${id}`);
          if (cachedGuestsStr) setGuests(JSON.parse(cachedGuestsStr));

          setAuthCheckComplete(true);
          setLoading(false); // show cached content immediately; revalidate below
        }
      } catch { }

      // 🚨 FETCH PAYWALL CONFIG (non-blocking — not needed for initial render, so don't await it)
      axios.get(`${API_URL}/config/paywall`)
        .then((configRes) => setPaywallActive(configRes.data.paywallActive))
        .catch(() => console.log("Failed to fetch paywall config"));

      const NetInfo = require('@react-native-community/netinfo').default;
      const networkState = await NetInfo.fetch();

      if (!networkState.isConnected) {
        console.log(`🌐 Device offline. Pulling event ${id} from Vault.`);
        const cachedEventStr = await AsyncStorage.getItem(`cache_event_${id}`);
        const cachedGuestsStr = await AsyncStorage.getItem(`cache_guests_${id}`);
        
        if (cachedEventStr) {
          const eventData = JSON.parse(cachedEventStr);
          setInvitation(eventData);
          
          const ownerId = eventData.host?._id || eventData.user;
          const isPrimaryHost = currentId === ownerId;
          const isDelegate = eventData.delegates && eventData.delegates.some((delegate: any) => {
            const delegateId = typeof delegate === 'string' ? delegate : delegate._id;
            return delegateId === currentId;
          });
          const userIsHost = isPrimaryHost || isDelegate;
          setIsHost(userIsHost);

          if (eventData.videoUrl) setVideoUrl(eventData.videoUrl);
          if (eventData.googleMapsLink) setGoogleMapsLink(eventData.googleMapsLink);
          if (!userIsHost && eventData.myRsvp) setMyRsvp(eventData.myRsvp);
          if (eventData.isSaved !== undefined) setIsSaved(eventData.isSaved);
          if (cachedGuestsStr) setGuests(JSON.parse(cachedGuestsStr));
        } else {
          Alert.alert('Error', 'No internet and no cached data for this event.');
          router.replace('/dashboard');
        }
        setAuthCheckComplete(true);
        setLoading(false);
        return;
      }

      // 🚨 ONLINE FETCH
      const eventRes = await axios.get(`${API_URL}/invitations/${id}`, { headers, timeout: 5000 });
      const eventData = eventRes.data;
      setInvitation(eventData);
      setLoading(false); // event data is here — show it now; guest list (below) loads in background
      await AsyncStorage.setItem(`cache_event_${id}`, JSON.stringify(eventData));

      const ownerId = eventData.host?._id || eventData.user;
      const isPrimaryHost = currentId === ownerId;
      const isDelegate = eventData.delegates && eventData.delegates.some((delegate: any) => {
        const delegateId = typeof delegate === 'string' ? delegate : delegate._id;
        return delegateId === currentId;
      });
      const userIsHost = isPrimaryHost || isDelegate;
      setIsHost(userIsHost); 

      // --- MARK AS READ LOGIC ---
      if (!userIsHost && eventData.isRead === false) {
        try {
          await axios.put(`${API_URL}/invitations/${id}/read`, {}, { headers });
          console.log('✅ Event marked as read');
        } catch (readErr) {
          console.log('⚠️ Failed to mark event as read');
        }
      }

      if (eventData.videoUrl) setVideoUrl(eventData.videoUrl);
      if (eventData.googleMapsLink) setGoogleMapsLink(eventData.googleMapsLink);
      if (!userIsHost && eventData.myRsvp) setMyRsvp(eventData.myRsvp);
      if (eventData.isSaved !== undefined) setIsSaved(eventData.isSaved);

      if (userIsHost) {
        try {
          const guestRes = await axios.get(`${API_URL}/invitations/${id}/guests`, { headers, timeout: 5000 });
          setGuests(guestRes.data.guests || []);
          setEventStats(guestRes.data.stats || null);
          setIdEnabled(guestRes.data.idCollectionEnabled || false);
          await AsyncStorage.setItem(`cache_guests_${id}`, JSON.stringify(guestRes.data.guests || []));
        } catch (guestErr) {
          setGuests([]);
        }
      }
      setAuthCheckComplete(true);
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || !err.response) {
         Alert.alert('Offline', 'Network connection dropped.');
         router.replace('/dashboard');
      } else {
         Alert.alert('Error', 'Failed to load event details.');
         router.replace('/dashboard');
      }
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      checkAuthAndFetch();
    }, [checkAuthAndFetch])
  );

  const silentRefresh = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const headers = { Authorization: `Bearer ${token}` };
      const guestRes = await axios.get(`${API_URL}/invitations/${id}/guests`, { headers, timeout: 5000 });
      setGuests(guestRes.data.guests || []);
      setEventStats(guestRes.data.stats || null);
      setIdEnabled(guestRes.data.idCollectionEnabled || false);
      await AsyncStorage.setItem(`cache_guests_${id}`, JSON.stringify(guestRes.data.guests || []));
    } catch (e) {
      console.log('Background refresh failed');
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    console.log('🔌 ATTEMPTING CONNECTION TO:', BASE_URL);
    const socket = io(BASE_URL, {
      transports: ['websocket'],
      forceNew: true,
    });

    socket.on('connect', () => {
      console.log('✅ SOCKET CONNECTED SUCCESS. ID:', socket.id);
    });

    socket.on('rsvp-updated', (payload: any) => {
      if (payload.eventId === id) {
        silentRefresh();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [id, silentRefresh]);

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'Date TBA';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', 
      day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  const loadMyGroups = async () => {
    setLoadingGroups(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const res = await axios.get(`${API_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMyGroups(res.data || []);
    } catch (err) {
      Alert.alert("Error", "Failed to load your groups.");
    } finally {
      setLoadingGroups(false);
    }
  };

  // 🚨 PAYWALL LOCK FOR CO-HOSTS
  const openCoHostModal = () => {
    if (paywallActive && !invitation?.isPremium) {
      Alert.alert("Premium Required", "Co-host management is a Premium feature.");
      setShowUpgradeModal(true);
      return;
    }
    setSelectedCoHosts(invitation?.delegates || []);
    setShowCoHostModal(true);
  };

  useEffect(() => {
    if (coHostSearchTimeoutRef.current) clearTimeout(coHostSearchTimeoutRef.current);
    if (coHostSearch.trim().length < 2) {
      setCoHostResults([]);
      return;
    }
    coHostSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        const res = await axios.get(`${API_URL}/users/search?query=${encodeURIComponent(coHostSearch)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const filtered = res.data.filter((u: any) => u._id !== currentUserId);
        setCoHostResults(filtered);
      } catch (err) {
        console.log('Failed to search users for co-host');
      }
    }, 300);
    return () => { if (coHostSearchTimeoutRef.current) clearTimeout(coHostSearchTimeoutRef.current); };
  }, [coHostSearch, currentUserId]);

  const toggleCoHost = (user: any) => {
    const isSelected = selectedCoHosts.some(c => (c._id || c) === user._id);
    if (isSelected) {
      setSelectedCoHosts(prev => prev.filter(c => (c._id || c) !== user._id));
    } else {
      setSelectedCoHosts(prev => [...prev, user]);
    }
  };

  const handleSaveCoHosts = async () => {
    setSavingCoHosts(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const delegateIds = selectedCoHosts.map(c => c._id || c);
      
      await axios.put(`${API_URL}/invitations/${id}/delegates`, 
        { delegates: delegateIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      Alert.alert('Success', 'Co-hosts updated successfully!');
      setShowCoHostModal(false);
      checkAuthAndFetch(); 
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to save co-hosts');
    } finally {
      setSavingCoHosts(false);
    }
  };

  const handleInviteGroup = async (groupId: string, groupName: string) => {
    Alert.alert(
      "Blast Invite",
      `Are you sure you want to invite everyone in "${groupName}" to this event?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Invite All",
          onPress: async () => {
            setInvitingGroup(groupId);
            try {
              const token = await AsyncStorage.getItem('authToken');
              const res = await axios.post(
                `${API_URL}/groups/${groupId}/send-invitation/${id}`,
                {}, 
                { headers: { Authorization: `Bearer ${token}` } }
              );
              Alert.alert("Success", res.data.message || "Group invited successfully!");
              setShowGroupModal(false);
              checkAuthAndFetch(); 
            } catch (err: any) {
              Alert.alert("Error", err.response?.data?.message || "Failed to blast invites");
            } finally {
              setInvitingGroup(null);
            }
          }
        }
      ]
    );
  };

  const handleShareEvent = async () => {
    try {
      const eventLink = `https://invitoinnbox.vercel.app/invitation/${id}`; 
      await Share.share({
        message: `You are invited to "${invitation?.title}"! \n\nDate: ${new Date(invitation?.eventDate).toLocaleDateString()}\n\nClick here to view details and RSVP: ${eventLink}`,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share event');
    }
  };

  const handleWhatsAppShare = async () => {
    const eventLink = `https://invitoinnbox.vercel.app/invitation/${id}`;
    const message = `You are invited to "${invitation?.title}"!\n\n📅 Date: ${new Date(invitation?.eventDate).toLocaleDateString()}\n📍 Location: ${invitation?.location || 'TBD'}\n\nClick here to view details and RSVP: ${eventLink}`;
    
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('WhatsApp Not Installed', 'WhatsApp is not installed on your device.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open WhatsApp');
    }
  };

  const exportGuestList = async () => {
    try {
      const guestListToExport = searchQuery.trim() ? filteredGuests : guests;
      if (guestListToExport.length === 0) {
        Alert.alert('No Guests', 'There are no guests to export.');
        return;
      }

      const escapeCSV = (str: string) => {
        if (!str) return '';
        const stringValue = String(str);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      const headers = ['Name', 'Contact', 'RSVP Status'];
      const rows = guestListToExport.map((guest: any) => {
        const guestName = guest.recipient?.name || guest.name || 'Unknown Guest';
        const guestEmail = guest.recipient?.email || '';
        const guestPhone = guest.recipient?.phone || '';
        const contact = guestPhone ? `${guestEmail} / ${guestPhone}` : guestEmail;
        
        let status = 'Pending';
        if (guest.rsvpStatus === 'accepted') status = 'Going';
        else if (guest.rsvpStatus === 'declined') status = "Can't Go";
        else if (guest.rsvpStatus === 'tentative') status = 'Maybe';
        
        return [escapeCSV(guestName), escapeCSV(contact), escapeCSV(status)].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const dir = (FileSystem as any).documentDirectory;
      const fileUri = `${dir}guest-list.csv`;
      
      await FileSystem.writeAsStringAsync(fileUri, csvContent);
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Guest List' });
      } else {
        Alert.alert('Sharing Not Available', 'Sharing is not available on this device.');
      }
    } catch (error) {
      Alert.alert('Export Failed', 'Failed to export guest list. Please try again.');
    }
  };

  const handleRSVP = async (status: string) => {
    const previousRsvp = myRsvp;
    setMyRsvp(status);
    setRsvpLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.put(
        `${API_URL}/invitations/${id}/rsvp`, 
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMyRsvp(response.data.rsvpStatus);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const statusMessage = status === 'accepted' ? 'attending' : status === 'declined' ? 'declined' : 'marked as maybe';
      Alert.alert('Success', `You are ${statusMessage}!`);
    } catch (err) {
      setMyRsvp(previousRsvp);
      Alert.alert('Error', 'Failed to update RSVP.');
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleToggleSave = async () => {
    setSaveLoading(true);
    const previousState = isSaved;
    setIsSaved(!isSaved);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await axios.put(
        `${API_URL}/invitations/${id}/save`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsSaved(response.data.isSaved);
    } catch (err) {
      setIsSaved(previousState);
      Alert.alert('Error', 'Failed to update save status');
    } finally {
      setSaveLoading(false);
    }
  };

  const pickImage = async () => {
    const newImages = await pickAndCompressImages(5); 
    if (newImages.length > 0) {
      const combined = [...attachments, ...newImages].slice(0, 5);
      setAttachments(combined);
    }
  };
  
  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const formData = new FormData();
      
      if (videoUrl) formData.append('videoUrl', videoUrl);
      if (googleMapsLink) formData.append('googleMapsLink', googleMapsLink);

      attachments.forEach((file) => {
        formData.append('attachments', {
          uri: file.uri,
          name: file.name,
          type: file.type,
        } as any); 
      });

      await axios.put(
        `${API_URL}/invitations/${id}`,
        formData,
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data', 
          } 
        }
      );

      Alert.alert('Success', 'Event media updated successfully!');
      setIsEditing(false);
      setAttachments([]); 
      checkAuthAndFetch();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update event media');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    Alert.alert(
      'Cancel Event',
      'Are you absolutely sure? This will delete the event and email all guests.',
      [
        { text: 'No, Keep It', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true); 
              const token = await AsyncStorage.getItem('authToken');
              await axios.delete(
                `${API_URL}/invitations/${id}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );              
              router.replace('/dashboard');
            } catch (error) {
              setIsDeleting(false);
              Alert.alert("Error", "Failed to cancel the event.");
            }
          },
        },
      ]
    );
  };

  const handleRemoveGuest = async (guestId: string) => {
    Alert.alert('Remove Guest', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('authToken');
            await axios.delete(
              `${API_URL}/invitations/${id}/guests/${guestId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            setGuests(prevGuests => prevGuests.filter(g => (g.recipient?._id || g._id) !== guestId));
          } catch (err) {
            Alert.alert('Error', 'Failed to remove guest');
          }
        },
      },
    ]);
  };

  // ---- Guest management (tags / expected / ID) ----
  const openManage = (guest: any) => {
    setManagingGuest(guest);
    setTagDraft(guest.tags || []);
    setCustomTag('');
    setExpectedDraft(String(guest.expectedCount ?? 1));
  };

  const toggleTag = (tag: string) => {
    setTagDraft((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const addCustomTag = () => {
    const t = customTag.trim();
    if (t && !tagDraft.includes(t)) setTagDraft([...tagDraft, t]);
    setCustomTag('');
  };

  const saveManage = async () => {
    const guestId = managingGuest.recipient?._id || managingGuest._id;
    setSavingManage(true);
    try {
      const headers = await authHeaders();
      await axios.put(`${API_URL}/invitations/${id}/guests/${guestId}/tags`, { tags: tagDraft }, { headers });
      const count = Number(expectedDraft);
      if (Number.isFinite(count) && count !== managingGuest.expectedCount) {
        await axios.put(`${API_URL}/invitations/${id}/guests/${guestId}/expected`, { expectedCount: count }, { headers });
      }
      Toast.show({ type: 'success', text1: 'Guest updated' });
      setManagingGuest(null);
      silentRefresh();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not save changes');
    } finally {
      setSavingManage(false);
    }
  };

  const requestGuestId = async (guest: any) => {
    const guestId = guest.recipient?._id || guest._id;
    try {
      const headers = await authHeaders();
      await axios.post(`${API_URL}/invitations/${id}/guests/${guestId}/request-id`, {}, { headers });
      Toast.show({ type: 'success', text1: 'ID requested' });
      silentRefresh();
    } catch (err: any) {
      if (err.response?.data?.requiresUpgrade) {
        Alert.alert('Premium feature', 'Collecting IDs requires upgrading this event.');
      } else {
        Alert.alert('Error', err.response?.data?.message || 'Could not request ID');
      }
    }
  };

  const requestIdNeedsHotel = async () => {
    try {
      const headers = await authHeaders();
      const res = await axios.post(`${API_URL}/invitations/${id}/request-id-by-tag`, { tag: 'Needs hotel' }, { headers });
      Toast.show({ type: 'success', text1: res.data?.message || 'IDs requested' });
      silentRefresh();
    } catch (err: any) {
      if (err.response?.data?.requiresUpgrade) {
        Alert.alert('Premium feature', 'Collecting IDs requires upgrading this event.');
      } else {
        Alert.alert('Error', err.response?.data?.message || 'Could not request IDs');
      }
    }
  };

  const viewGuestDoc = async (guestId: string, docId: string) => {
    try {
      const headers = await authHeaders();
      const res = await axios.get(`${API_URL}/invitations/${id}/guests/${guestId}/id-documents/${docId}/view`, { headers });
      if (res.data?.url) Linking.openURL(res.data.url);
    } catch {
      Alert.alert('Error', 'Could not open document');
    }
  };

  const deleteGuestDoc = async (guestId: string, docId: string) => {
    Alert.alert('Delete document', 'Remove this ID document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const headers = await authHeaders();
            await axios.delete(`${API_URL}/invitations/${id}/guests/${guestId}/id-documents/${docId}`, { headers });
            Toast.show({ type: 'success', text1: 'Deleted' });
            silentRefresh();
          } catch {
            Alert.alert('Error', 'Could not delete');
          }
        }
      },
    ]);
  };

  const anyNeedsHotel = guests.some((g: any) => (g.tags || []).includes('Needs hotel'));

  if (loading || !authCheckComplete) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // 🚨 FIX FOR THE BLANK SCREEN OF DEATH
  if (!invitation && authCheckComplete) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <Stack.Screen options={{ title: 'Error', headerShown: false }} />
        <Text style={{ color: COLORS.danger, fontSize: 16, fontWeight: 'bold' }}>Failed to load event data.</Text>
        <TouchableOpacity 
          onPress={checkAuthAndFetch} 
          style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: COLORS.primary, borderRadius: 8 }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isDeleting) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <Stack.Screen options={{ title: 'Cancelling...', headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.danger} />
        <Text style={{ marginTop: 10, color: COLORS.danger, fontWeight: 'bold' }}>Cancelling Event...</Text>
      </View>
    );
  }

  const attending = guests.filter(g => g.rsvpStatus === 'accepted').length;
  const pending = guests.filter(g => g.rsvpStatus === 'tentative' || !g.rsvpStatus).length;
  const declined = guests.filter(g => g.rsvpStatus === 'declined').length;

  const filteredGuests = guests.filter((guest: any) => {
    const name = guest.recipient?.name || guest.name || 'Unknown Guest';
    const email = guest.recipient?.email || guest.email || '';
    const query = searchQuery.toLowerCase();
    return name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
  });

  const rawImages = [invitation?.coverImage, ...(invitation?.attachments?.map((a: any) => typeof a === 'string' ? a : a.url || a.secure_url) || [])].filter(Boolean);
  const allImages = rawImages.map((img: string) => optimizeCloudinaryUrl(img, 800));

  const atLimit = guests.length >= FREE_GUEST_LIMIT;

  return (
    <>
      <Stack.Screen options={{ title: 'Event Details', headerShown: false }} />
      <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
        
        {allImages.length > 0 ? (
          <ImageCarousel images={allImages} />
        ) : (
          <View style={[styles.coverImage, styles.carouselPlaceholder]}><Text style={{ fontSize: 40 }}>📅</Text></View>
        )}
        
        {!isHost && (
          <TouchableOpacity style={styles.bookmarkButton} onPress={handleToggleSave} disabled={saveLoading} activeOpacity={0.8}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={24} color={isSaved ? "#F59E0B" : "#FFFFFF"} />
          </TouchableOpacity>
        )}

          {/* Shows only if the host requested this guest's ID */}
          {!isHost && <GuestIdUpload invitationId={id as string} />}

          {/* Guest's QR entry pass */}
          {!isHost && <GuestTicket invitationId={id as string} />}

          <View style={styles.detailsCard}>
            <Text style={styles.title}>{invitation.title}</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.icon}>👤</Text>
            <Text style={styles.infoText}>
              <Text style={{ fontWeight: '600' }}>Hosted by </Text>
              {invitation.host?.name || 'Unknown'}
            </Text>
          </View>

          {invitation.delegates && invitation.delegates.length > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.icon}>👑</Text>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                <Text style={{ fontWeight: '600', marginRight: 4 }}>Co-Hosts: </Text>
                {invitation.delegates.map((delegate: any, index: number) => {
                  const delegateName = delegate?.name || 'Unknown';
                  const delegateInitial = delegateName.charAt(0).toUpperCase();
                  return (
                    <View key={delegate._id || delegate || index} style={styles.coHostBadge}>
                      <View style={styles.coHostInitial}><Text style={styles.coHostInitialText}>{delegateInitial}</Text></View>
                      <Text style={styles.coHostName}>{delegateName}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.icon}>📅</Text>
            <Text style={styles.infoText}>{formatDateTime(invitation.eventDate)}</Text>
          </View>
          
          <TouchableOpacity style={styles.infoRow} onPress={invitation.googleMapsLink ? () => Linking.openURL(invitation.googleMapsLink) : undefined} disabled={!invitation.googleMapsLink}>
            <Text style={styles.icon}>📍</Text>
            <Text style={[styles.infoText, invitation.googleMapsLink && { color: COLORS.primary, textDecorationLine: 'underline' }]}>{invitation.location}</Text>
          </TouchableOpacity>

          {invitation.videoUrl && (
            <TouchableOpacity style={styles.infoRow} onPress={() => Linking.openURL(invitation.videoUrl)}>
              <Text style={styles.icon}>🎬</Text>
              <Text style={[styles.infoText, { color: COLORS.primary, textDecorationLine: 'underline' }]}>Watch Video</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionsContainer}>
            {isHost ? (
              <View>
                <Text style={styles.sectionTitle}>RSVP Analytics</Text>
                
                {/* 🚨 INJECTED UPGRADE BUTTON */}
                {invitation.isPremium ? (
                  <View style={[styles.button, { backgroundColor: '#FEF9C3', marginBottom: SPACING.md, paddingVertical: 10 }]}>
                    <Text style={{ color: '#92400E', fontWeight: 'bold', fontSize: 14 }}>⭐ Premium Active</Text>
                  </View>
                ) : paywallActive ? (
                  <TouchableOpacity 
                    style={[styles.button, { backgroundColor: '#F59E0B', marginBottom: SPACING.md, paddingVertical: 10 }]} 
                    onPress={() => setShowUpgradeModal(true)}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>⭐ Upgrade — ₹419</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.analyticsRow}>
                  <View style={[styles.analyticsCard, { backgroundColor: COLORS.success }]}><Text style={styles.analyticsNumber}>{attending}</Text><Text style={styles.analyticsLabel}>Going</Text></View>
                  <View style={[styles.analyticsCard, { backgroundColor: '#F59E0B' }]}><Text style={styles.analyticsNumber}>{pending}</Text><Text style={styles.analyticsLabel}>Pending</Text></View>
                  <View style={[styles.analyticsCard, { backgroundColor: COLORS.danger }]}><Text style={styles.analyticsNumber}>{declined}</Text><Text style={styles.analyticsLabel}>No</Text></View>
                </View>

                {/* Expected headcount (family sizes) — host planning number */}
                {eventStats && (
                  <View style={styles.headcountRow}>
                    <Text style={styles.headcountText}>
                      Expected people: <Text style={styles.headcountStrong}>{eventStats.expectedAttending}</Text> confirmed
                      {' · '}
                      <Text style={styles.headcountStrong}>{eventStats.expectedTotal}</Text> if all pending come
                    </Text>
                  </View>
                )}

                {/* Day-of QR check-in */}
                <TouchableOpacity style={styles.scanBtn} onPress={() => router.push(`/scan/${id}`)}>
                  <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.scanBtnText}>
                    Scan Check-in{eventStats?.arrived ? `  ·  ${eventStats.arrived} arrived` : ''}
                  </Text>
                </TouchableOpacity>

                {guests.length > 0 && (
                  <View style={styles.guestListContainer}>
                    <Text style={styles.sectionTitle}>Attendee Roster</Text>
                    <Text style={styles.guestSummaryText}>{attending} Attending, {declined} Declined{pending > 0 ? `, ${pending} Pending` : ''}</Text>
                    
                    <TextInput
                      style={[styles.input, { marginBottom: SPACING.md, backgroundColor: '#F3F4F6' }]}
                      placeholder="🔍 Search by name or email..."
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />

                    <TouchableOpacity
                      style={[styles.exportCSVButton, { marginBottom: SPACING.md }]}
                      onPress={exportGuestList}
                    >
                      <Text style={styles.exportCSVButtonText}>📊 Export CSV</Text>
                    </TouchableOpacity>

                    {filteredGuests.map((guest: any, index: number) => {
                      const guestName = guest.recipient?.name || guest.name || 'Unknown Guest';
                      const guestEmail = guest.recipient?.email || guest.email || '';
                      const rsvpStatus = guest.rsvpStatus;
                      const gId = guest.recipient?._id || guest._id;
                      const gTags = guest.tags || [];
                      const gDocs = guest.idDocuments || [];
                      const gRequested = guest.idRequest?.requested;
                      return (
                        <View key={index} style={styles.guestCard}>
                          <View style={[styles.guestRow, { justifyContent: 'space-between' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <View style={styles.guestAvatar}><Text style={styles.guestInitial}>{guestName.charAt(0).toUpperCase()}</Text></View>
                              <View style={styles.guestInfo}>
                                <Text style={styles.guestName}>{guestName}</Text>
                                <Text style={styles.guestEmail}>{guestEmail || `${guest.expectedCount ?? 1} expected`}</Text>
                              </View>
                            </View>
                            <View style={[styles.guestStatus, rsvpStatus === 'accepted' && styles.guestStatusGoing, rsvpStatus === 'declined' && styles.guestStatusDeclined, (!rsvpStatus || rsvpStatus === 'tentative') && styles.guestStatusPending]}>
                              <Text style={styles.guestStatusText}>{rsvpStatus === 'accepted' ? 'Going' : rsvpStatus === 'declined' ? 'No' : 'Pending'}</Text>
                            </View>
                          </View>

                          {gTags.length > 0 && (
                            <View style={styles.tagChipRow}>
                              {gTags.map((t: string) => (
                                <View key={t} style={styles.tagChip}><Text style={styles.tagChipText}>{t}</Text></View>
                              ))}
                            </View>
                          )}

                          <View style={styles.guestActionsRow}>
                            <TouchableOpacity onPress={() => openManage(guest)}><Text style={styles.manageLink}>Manage</Text></TouchableOpacity>

                            {idEnabled && (
                              gDocs.length > 0 ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <Text style={styles.idSubmitted}>🔒 ID:</Text>
                                  {gDocs.map((d: any) => (
                                    <View key={d._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <TouchableOpacity onPress={() => viewGuestDoc(gId, d._id)}><Text style={styles.manageLink}>{d.label || 'View'}</Text></TouchableOpacity>
                                      <TouchableOpacity onPress={() => deleteGuestDoc(gId, d._id)}><Text style={styles.removeGuestText}>✕</Text></TouchableOpacity>
                                    </View>
                                  ))}
                                </View>
                              ) : gRequested ? (
                                <Text style={styles.idPending}>⏳ ID requested</Text>
                              ) : (
                                <TouchableOpacity onPress={() => requestGuestId(guest)}><Text style={styles.requestIdLink}>Request ID</Text></TouchableOpacity>
                              )
                            )}

                            <TouchableOpacity onPress={() => handleRemoveGuest(gId)}><Text style={styles.removeGuestText}>Remove</Text></TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    {filteredGuests.length === 0 && (
                      <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginTop: 10 }}>No guests match your search.</Text>
                    )}

                    {idEnabled && anyNeedsHotel && (
                      <TouchableOpacity style={styles.needsHotelBtn} onPress={requestIdNeedsHotel}>
                        <Text style={styles.needsHotelBtnText}>🪪 Request IDs from everyone tagged "Needs hotel"</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg }}>
                  <TouchableOpacity 
                    style={[styles.button, { backgroundColor: COLORS.primary, flex: 1 }]} 
                    onPress={() => router.push('/invite/' + id)}
                  >
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>+ Individual</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.button, { backgroundColor: '#8B5CF6', flex: 1 }]} 
                    onPress={() => {
                      setShowGroupModal(true);
                      loadMyGroups();
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>👥 Invite Group</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: '#10B981', marginTop: SPACING.sm }]} 
                  onPress={handleShareEvent}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>📤 Share Forwardable Link</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: '#25D366', marginTop: SPACING.sm }]} 
                  onPress={handleWhatsAppShare}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>💬 Share via WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: '#EEF2FF', marginTop: SPACING.sm, borderWidth: 1, borderColor: '#C7D2FE' }]} 
                  onPress={() => Linking.openURL(generateGoogleCalendarLink(invitation))}
                >
                  <Text style={{ color: '#312E81', fontWeight: 'bold', fontSize: 14 }}>📅 Add to Google Calendar</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primaryLight, marginTop: SPACING.sm }]} onPress={() => setIsEditing(!isEditing)}>
                  <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>{isEditing ? 'Cancel Edit' : 'Edit Event Media'}</Text>
                </TouchableOpacity>

                {isEditing && (
                  <View style={styles.editSection}>
                    <Text style={styles.editSectionTitle}>Edit Event Media</Text>
                    
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Add Photos</Text>
                      <TouchableOpacity style={{ backgroundColor: '#E0E7FF', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#C7D2FE', borderStyle: 'dashed' }} onPress={pickImage}>
                        <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>+ Select Images from Gallery</Text>
                      </TouchableOpacity>

                      {attachments.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                          {attachments.map((file, index) => (
                            <View key={index} style={{ marginRight: 10, position: 'relative' }}>
                              <Image source={{ uri: file.uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                              <TouchableOpacity 
                                style={{ position: 'absolute', top: -5, right: -5, backgroundColor: COLORS.danger, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }} 
                                onPress={() => removeAttachment(index)}
                              >
                                <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>X</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </ScrollView>
                      )}
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Video URL (Optional)</Text>
                      <TextInput style={styles.input} placeholder="YouTube or video link" value={videoUrl} onChangeText={setVideoUrl} keyboardType="url" autoCapitalize="none" />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Google Maps Link</Text>
                      <TextInput style={styles.input} placeholder="Maps link" value={googleMapsLink} onChangeText={setGoogleMapsLink} keyboardType="url" autoCapitalize="none" />
                    </View>
                    <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSaveChanges} disabled={saving}>
                      {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View>
                <Text style={[styles.sectionTitle, { marginBottom: SPACING.md }]}>Will you attend?</Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  <TouchableOpacity disabled={rsvpLoading} onPress={() => handleRSVP('accepted')} style={[styles.rsvpBtn, myRsvp === 'accepted' ? { backgroundColor: COLORS.success } : { backgroundColor: COLORS.input }]}>
                    <Text style={{ fontWeight: 'bold', color: myRsvp === 'accepted' ? 'white' : COLORS.text }}>Going</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={rsvpLoading} onPress={() => handleRSVP('declined')} style={[styles.rsvpBtn, myRsvp === 'declined' ? { backgroundColor: COLORS.danger } : { backgroundColor: COLORS.input }]}>
                    <Text style={{ fontWeight: 'bold', color: myRsvp === 'declined' ? 'white' : COLORS.text }}>Can't Go</Text>
                  </TouchableOpacity>
                </View>

                {myRsvp === 'accepted' && (
                  <View style={{ marginTop: 16, padding: 12, backgroundColor: '#EEF2FF', borderRadius: 8, borderWidth: 1, borderColor: '#E0E7FF' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#312E81', marginBottom: 8 }}>
                      Add to your calendar:
                    </Text>
                    <TouchableOpacity 
                      style={{ backgroundColor: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center' }}
                      onPress={() => Linking.openURL(generateGoogleCalendarLink(invitation))}
                    >
                      <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>
                        📅 Open Google Calendar
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>

          {invitation.description && (
            <View style={{ marginTop: SPACING.xl }}>
              <Text style={styles.sectionTitle}>About this event</Text>
              <Text style={{ ...TYPOGRAPHY.body, lineHeight: 24 }}>{invitation.description}</Text>
            </View>
          )}
        </View>

        {isHost && (
          <View style={styles.bottomControlPanel}>
            {currentUserId === (invitation.host?._id || invitation.user) && (
              <TouchableOpacity 
                style={[styles.editEventButton, { backgroundColor: '#8B5CF6', marginBottom: SPACING.md }]} 
                onPress={openCoHostModal}
              >
                <Text style={styles.editEventButtonText}>👑 Manage Co-Hosts</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.editEventButton} onPress={() => router.push(`/edit/${id}`)}>
              <Text style={styles.editEventButtonText}>Edit Event Details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cancelEventButton, isDeleting && styles.cancelEventButtonDisabled]} onPress={handleDeleteEvent} disabled={isDeleting}>
              {isDeleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.cancelEventButtonText}>Cancel Event</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* --- GROUP INVITATION MODAL --- */}
      <Modal visible={showGroupModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>Select a Group</Text>
              <TouchableOpacity onPress={() => setShowGroupModal(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingGroups ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
            ) : myGroups.length === 0 ? (
              <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginVertical: 40 }}>
                You haven't created any groups yet.
              </Text>
            ) : (
              <FlatList
                data={myGroups}
                keyExtractor={(item) => item._id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isAdmin = item.owner?._id === currentUserId || 
                                  item.admins?.some((a: any) => a._id === currentUserId);
                  const isLocked = item.invitePermission === 'admins' && !isAdmin;
                  
                  return (
                    <View style={[styles.groupItemCard, isLocked && { opacity: 0.5 }]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.groupItemName}>{item.name}</Text>
                          {isLocked && (
                            <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 8 }}>
                              <Text style={{ fontSize: 10, color: '#DC2626', fontWeight: '600' }}>🔒 Admins Only</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.groupItemCount}>{item.members?.length || 0} Members</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.blastButton, (invitingGroup === item._id || isLocked) && { opacity: 0.7 }]}
                        disabled={invitingGroup === item._id || isLocked}
                        onPress={() => handleInviteGroup(item._id, item.name)}
                      >
                        {invitingGroup === item._id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : isLocked ? (
                          <Text style={styles.blastButtonText}>Locked</Text>
                        ) : (
                          <Text style={styles.blastButtonText}>Blast Invite</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* --- MANAGE CO-HOSTS MODAL --- */}
      <Modal visible={showCoHostModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>Manage Co-Hosts</Text>
              <TouchableOpacity onPress={() => setShowCoHostModal(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{...TYPOGRAPHY.small, color: COLORS.textMuted, marginBottom: SPACING.md}}>
              Co-hosts get a "spare key" to this event. They can edit details and invite their own guests.
            </Text>

            <TextInput
              style={[styles.input, { marginBottom: SPACING.md }]}
              placeholder="Search registered users by name or email..."
              value={coHostSearch}
              onChangeText={setCoHostSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {coHostResults.length > 0 && (
              <ScrollView style={{ maxHeight: 200, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8 }}>
                {coHostResults.map((user) => {
                  const isSelected = selectedCoHosts.some(c => (c._id || c) === user._id);
                  return (
                    <TouchableOpacity 
                      key={user._id} 
                      style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      onPress={() => toggleCoHost(user)}
                    >
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>{user.name}</Text>
                        <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{user.email}</Text>
                      </View>
                      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: isSelected ? COLORS.primary : COLORS.border, backgroundColor: isSelected ? COLORS.primary : 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                        {isSelected && <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity 
              style={[styles.saveButton, savingCoHosts && { opacity: 0.7 }]} 
              onPress={handleSaveCoHosts} 
              disabled={savingCoHosts}
            >
              {savingCoHosts ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Co-Hosts</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🚨 NATIVE UPGRADE MODAL */}
      <PremiumUpgradeModal
        visible={showUpgradeModal}
        invitationId={id as string}
        onClose={() => setShowUpgradeModal(false)}
        onSuccess={(updatedInvitation) => {
          setInvitation(updatedInvitation);
        }}
      />

      {/* Manage guest (tags + expected) */}
      <Modal visible={!!managingGuest} transparent animationType="slide" onRequestClose={() => setManagingGuest(null)}>
        <View style={styles.manageOverlay}>
          <View style={styles.manageCard}>
            <View style={styles.gmHeader}>
              <Text style={styles.gmTitle}>Manage {managingGuest?.recipient?.name || 'guest'}</Text>
              <TouchableOpacity onPress={() => setManagingGuest(null)}><Ionicons name="close" size={24} color={COLORS.textMuted} /></TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.manageLabel}>Tags</Text>
              <View style={styles.tagChipRow}>
                {PRESET_TAGS.map((t) => {
                  const on = tagDraft.includes(t);
                  return (
                    <TouchableOpacity key={t} onPress={() => toggleTag(t)} style={[styles.manageTag, on && styles.manageTagOn]}>
                      <Text style={[styles.manageTagText, on && styles.manageTagTextOn]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {tagDraft.filter((t) => !PRESET_TAGS.includes(t)).length > 0 && (
                <View style={styles.tagChipRow}>
                  {tagDraft.filter((t) => !PRESET_TAGS.includes(t)).map((t) => (
                    <TouchableOpacity key={t} onPress={() => toggleTag(t)} style={[styles.manageTag, styles.manageTagOn]}>
                      <Text style={styles.manageTagTextOn}>{t} ✕</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: 6 }}>
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: COLORS.input }]}
                  value={customTag}
                  onChangeText={setCustomTag}
                  placeholder="Add custom tag"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TouchableOpacity style={styles.addTagBtn} onPress={addCustomTag}><Text style={{ fontWeight: '700', color: COLORS.text }}>Add</Text></TouchableOpacity>
              </View>

              <Text style={styles.manageLabel}>Expected people (host only)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: COLORS.input }]}
                value={expectedDraft}
                onChangeText={(t) => setExpectedDraft(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={COLORS.textMuted}
              />

              <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary, marginTop: SPACING.lg }, savingManage && { opacity: 0.6 }]} onPress={saveManage} disabled={savingManage}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{savingManage ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  carouselPlaceholder: { backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  coverImage: { width: '100%', height: 400, resizeMode: 'cover' },
  bookmarkButton: { position: 'absolute', top: 20, right: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 50 },
  detailsCard: { backgroundColor: COLORS.card, marginTop: -40, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: SPACING.lg, minHeight: 500, ...SHADOWS.card },
  title: { ...TYPOGRAPHY.title, fontSize: 28, marginBottom: SPACING.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  icon: { fontSize: 18, marginRight: SPACING.sm },
  infoText: { ...TYPOGRAPHY.bodyMuted, flex: 1 },
  actionsContainer: { marginTop: SPACING.xl, paddingTop: SPACING.lg, borderTopWidth: 1, borderColor: COLORS.border },
  sectionTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.sm },
  
  analyticsRow: { flexDirection: 'row', gap: SPACING.sm },
  analyticsCard: { flex: 1, padding: SPACING.md, borderRadius: 12, alignItems: 'center' },
  headcountRow: { marginTop: SPACING.sm, backgroundColor: COLORS.primaryLight, borderRadius: 8, padding: SPACING.sm },
  headcountText: { fontSize: 13, color: COLORS.primary, textAlign: 'center' },
  headcountStrong: { fontWeight: '800' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0D9488', borderRadius: 10, paddingVertical: SPACING.md, marginTop: SPACING.md },
  scanBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  guestCard: { backgroundColor: COLORS.card, borderRadius: 10, padding: SPACING.sm, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  tagChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tagChip: { backgroundColor: '#CCFBF1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tagChipText: { fontSize: 11, color: '#0F766E', fontWeight: '600' },
  guestActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  manageLink: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  requestIdLink: { color: '#4F46E5', fontWeight: '700', fontSize: 13 },
  idPending: { color: '#B45309', fontSize: 12 },
  idSubmitted: { color: COLORS.success, fontSize: 12, fontWeight: '600' },
  needsHotelBtn: { backgroundColor: COLORS.primaryLight, borderRadius: 8, padding: SPACING.sm, marginTop: SPACING.sm, alignItems: 'center' },
  needsHotelBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

  manageOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  manageCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, maxHeight: '85%' },
  gmHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  gmTitle: { ...TYPOGRAPHY.header },
  manageLabel: { ...TYPOGRAPHY.small, marginTop: SPACING.md, marginBottom: 4 },
  manageTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  manageTagOn: { backgroundColor: '#0D9488', borderColor: '#0D9488' },
  manageTagText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  manageTagTextOn: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
  addTagBtn: { backgroundColor: COLORS.input, borderRadius: 8, paddingHorizontal: SPACING.md, justifyContent: 'center' },
  analyticsNumber: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  analyticsLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 4 },
  
  button: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rsvpBtn: { flex: 1, paddingVertical: 14, borderRadius: 100, alignItems: 'center' },
  
  editSection: { marginTop: SPACING.lg, padding: SPACING.md, backgroundColor: COLORS.background, borderRadius: 16 },
  editSectionTitle: { ...TYPOGRAPHY.header, marginBottom: SPACING.md },
  inputGroup: { marginBottom: SPACING.md },
  inputLabel: { ...TYPOGRAPHY.small, fontWeight: '600', marginBottom: SPACING.xs },
  input: { backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, ...TYPOGRAPHY.body, borderWidth: 1, borderColor: COLORS.border },
  
  saveButton: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: 'white', fontWeight: 'bold' },
  saveButtonDisabled: { opacity: 0.7 },

  guestListContainer: { marginTop: SPACING.lg, backgroundColor: COLORS.background, borderRadius: 12, padding: SPACING.md },
  guestSummaryText: { ...TYPOGRAPHY.bodyMuted, marginBottom: SPACING.md },
  guestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  guestAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm },
  guestInitial: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  guestInfo: { flex: 1 },
  guestName: { ...TYPOGRAPHY.body, fontWeight: '600' },
  guestEmail: { ...TYPOGRAPHY.small, color: COLORS.textMuted },
  guestStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, minWidth: 70, alignItems: 'center' },
  guestStatusGoing: { backgroundColor: COLORS.success + '20' },
  guestStatusDeclined: { backgroundColor: COLORS.danger + '20' },
  guestStatusPending: { backgroundColor: '#F59E0B' + '20' },
  guestStatusText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  removeGuestButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.danger },
  removeGuestText: { color: COLORS.danger, fontSize: 12, fontWeight: '600' },
  
  bottomControlPanel: { marginTop: SPACING.lg, marginBottom: SPACING.xl, paddingHorizontal: SPACING.lg },
  editEventButton: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: SPACING.md },
  editEventButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  cancelEventButton: { backgroundColor: COLORS.danger, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  cancelEventButtonDisabled: { opacity: 0.7 },
  cancelEventButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },

  // --- MODAL STYLES ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, maxHeight: '80%', ...SHADOWS.card },
  manageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  manageTitle: { ...TYPOGRAPHY.title, fontSize: 22 },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.textMuted },
  groupItemCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.background, borderRadius: 12, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  groupItemName: { ...TYPOGRAPHY.body, fontWeight: 'bold' },
  groupItemCount: { ...TYPOGRAPHY.small, color: COLORS.textMuted },
  blastButton: { backgroundColor: '#8B5CF6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  blastButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  // --- CO-HOST BADGE STYLES ---
  coHostBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3E8FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16, marginRight: 6, marginBottom: 4 },
  coHostInitial: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  coHostInitialText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  coHostName: { fontSize: 12, color: '#6B21A8', fontWeight: '500' },
  
  // --- EXPORT CSV BUTTON STYLES ---
  exportCSVButton: { backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  exportCSVButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});