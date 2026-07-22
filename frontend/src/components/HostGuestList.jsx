import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import CheckinScanner from './CheckinScanner';

const PRESET_TAGS = ['VIP', "Bride's side", "Groom's side", 'Needs hotel', 'Family', 'Friends'];

const HostGuestList = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [guests, setGuests] = useState([]);
  const [stats, setStats] = useState(null);
  const [isPremium, setIsPremium] = useState(false); // whether ID collection is available (premium or paywall off)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('');
  const [removingGuest, setRemovingGuest] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Per-guest management panel
  const [managing, setManaging] = useState(null); // the guest record being managed
  const [tagDraft, setTagDraft] = useState([]);
  const [customTag, setCustomTag] = useState('');
  const [expectedDraft, setExpectedDraft] = useState('1');
  const [savingManage, setSavingManage] = useState(false);

  // Check-in
  const [scanning, setScanning] = useState(false);
  const [reminding, setReminding] = useState(false);

  useEffect(() => {
    fetchGuestList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchGuestList = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/invitations/${id}/guests`);
      setGuests(response.data.guests || []);
      setStats(response.data.stats || null);
      // idCollectionEnabled = premium OR paywall globally off
      setIsPremium(response.data.idCollectionEnabled ?? response.data.isPremium ?? false);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load guest list');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveGuest = async (guestId, guestName) => {
    if (!window.confirm(`Remove ${guestName || 'this guest'}?`)) return;
    try {
      setRemovingGuest(guestId);
      await api.delete(`/invitations/${id}/guests/${guestId}`);
      setGuests(guests.filter(g => g.recipient?._id !== guestId));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove guest');
    } finally {
      setRemovingGuest(null);
    }
  };

  // ---- Manage panel ----
  const openManage = (guest) => {
    setManaging(guest);
    setTagDraft(guest.tags || []);
    setCustomTag('');
    setExpectedDraft(String(guest.expectedCount ?? 1));
  };

  const toggleTag = (tag) => {
    setTagDraft((prev) => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  };

  const addCustomTag = () => {
    const t = customTag.trim();
    if (t && !tagDraft.includes(t)) setTagDraft([...tagDraft, t]);
    setCustomTag('');
  };

  const saveManage = async () => {
    const guestId = managing.recipient?._id;
    setSavingManage(true);
    try {
      await api.put(`/invitations/${id}/guests/${guestId}/tags`, { tags: tagDraft });
      const count = Number(expectedDraft);
      if (Number.isFinite(count) && count !== managing.expectedCount) {
        await api.put(`/invitations/${id}/guests/${guestId}/expected`, { expectedCount: count });
      }
      toast.success('Guest updated');
      setManaging(null);
      fetchGuestList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save changes');
    } finally {
      setSavingManage(false);
    }
  };

  // ---- ID collection ----
  const requestId = async (guest) => {
    const guestId = guest.recipient?._id;
    try {
      await api.post(`/invitations/${id}/guests/${guestId}/request-id`, {});
      toast.success(`ID requested from ${guest.recipient?.name || 'guest'}`);
      fetchGuestList();
    } catch (err) {
      if (err.response?.data?.requiresUpgrade) {
        toast.error('Collecting IDs is a Premium feature. Upgrade this event.');
      } else {
        toast.error(err.response?.data?.message || 'Could not request ID');
      }
    }
  };

  const cancelIdRequest = async (guest) => {
    const guestId = guest.recipient?._id;
    try {
      await api.post(`/invitations/${id}/guests/${guestId}/cancel-id-request`, {});
      toast.success('ID request cancelled');
      fetchGuestList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not cancel');
    }
  };

  const requestIdForNeedsHotel = async () => {
    try {
      const res = await api.post(`/invitations/${id}/request-id-by-tag`, { tag: 'Needs hotel' });
      toast.success(res.data?.message || 'IDs requested');
      fetchGuestList();
    } catch (err) {
      if (err.response?.data?.requiresUpgrade) {
        toast.error('Collecting IDs is a Premium feature. Upgrade this event.');
      } else {
        toast.error(err.response?.data?.message || 'Could not request IDs');
      }
    }
  };

  const viewDocument = async (guestId, docId) => {
    try {
      const res = await api.get(`/invitations/${id}/guests/${guestId}/id-documents/${docId}/view`);
      if (res.data?.url) window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error('Could not open document');
    }
  };

  const deleteDocument = async (guestId, docId) => {
    if (!window.confirm('Delete this ID document?')) return;
    try {
      await api.delete(`/invitations/${id}/guests/${guestId}/id-documents/${docId}`);
      toast.success('Document deleted');
      fetchGuestList();
    } catch (err) {
      toast.error('Could not delete document');
    }
  };

  // ---- RSVP reminder ----
  const remindNonResponders = async () => {
    setReminding(true);
    try {
      const res = await api.post(`/invitations/${id}/remind-pending`);
      toast.success(res.data.message);
      fetchGuestList();
    } catch (err) {
      if (err.response?.status === 429) toast(err.response.data.message, { icon: '⏳' });
      else toast.error(err.response?.data?.message || 'Could not send reminders');
    } finally {
      setReminding(false);
    }
  };

  // ---- Check-in ----
  const checkInGuest = async (guestId) => {
    try {
      const res = await api.post(`/invitations/${id}/checkin`, { guestId });
      if (res.data.status === 'already') toast(res.data.message, { icon: '⚠️' });
      else toast.success(res.data.message);
      fetchGuestList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-in failed');
    }
  };

  const undoCheckInGuest = async (guestId) => {
    try {
      await api.post(`/invitations/${id}/checkin/undo`, { guestId });
      toast.success('Check-in reversed');
      fetchGuestList();
    } catch (err) {
      toast.error('Could not undo');
    }
  };

  // From the webcam scanner — check in by ticket token
  const handleScanned = async (ticketId) => {
    try {
      const res = await api.post(`/invitations/${id}/checkin`, { ticketId });
      if (res.data.status === 'ok') toast.success(res.data.message);
      else if (res.data.status === 'already') toast(res.data.message, { icon: '⚠️' });
      else toast.error(res.data.message);
      fetchGuestList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ticket not recognised');
    }
  };

  const getStatusInfo = (status) => ({
    accepted: { label: 'Going', color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
    declined: { label: "Can't Go", color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
    tentative: { label: 'Maybe', color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
  }[status] || { label: 'Pending', color: 'bg-gray-100 text-gray-800', dot: 'bg-gray-500' });

  const filteredGuests = guests.filter(guest => {
    if (filter !== 'All') {
      const s = guest.rsvpStatus;
      if (filter === 'Going' && s !== 'accepted') return false;
      if (filter === 'Maybe' && s !== 'tentative') return false;
      if (filter === "Can't Go" && s !== 'declined') return false;
      if (filter === 'Pending' && s && s !== 'Pending') return false;
      if (filter === 'Arrived' && !guest.checkedIn) return false;
    }
    if (tagFilter && !(guest.tags || []).includes(tagFilter)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (guest.recipient?.name || '').toLowerCase();
      const email = (guest.recipient?.email || '').toLowerCase();
      if (!name.includes(q) && !email.includes(q)) return false;
    }
    return true;
  });

  // All tags in use, for the filter dropdown
  const allTags = [...new Set(guests.flatMap(g => g.tags || []))];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading guest list...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900">Guest List</h1>
          <button
            onClick={() => navigate(`/invitation/${id}`, { replace: true })}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Back to Event
          </button>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}

        {/* Headcount dashboard */}
        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
              <StatCard label="Invited" value={stats.invited} />
              <StatCard label="Going" value={stats.accepted} tone="green" />
              <StatCard label="Pending" value={stats.pending} tone="gray" />
              <StatCard label="Declined" value={stats.declined} tone="red" />
              <StatCard label="Expected (attending)" value={stats.expectedAttending} tone="indigo" />
              <StatCard label="Arrived" value={stats.arrived || 0} tone="green" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              {stats.pending > 0 && (
                <button
                  onClick={remindNonResponders}
                  disabled={reminding}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  {reminding ? 'Sending…' : `🔔 Remind ${stats.pending} non-responders`}
                </button>
              )}
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-sm text-teal-900">
                  <strong>{stats.arrived || 0}</strong> of <strong>{stats.accepted}</strong> going arrived
                </span>
                <button
                  onClick={() => setScanning(true)}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  📷 Scan QR
                </button>
              </div>
            </div>
          </>
        )}

        {/* Search + filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex flex-col lg:flex-row lg:items-center gap-3">
          <input
            type="text"
            placeholder="Search by name or contact..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {['All', 'Going', 'Maybe', "Can't Go", 'Pending', 'Arrived'].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${filter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {s}
              </button>
            ))}
          </div>
          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* Premium ID bulk action */}
        {isPremium && allTags.includes('Needs hotel') && (
          <div className="mb-6 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <span className="text-sm text-indigo-900">
              Request IDs from everyone tagged <strong>Needs hotel</strong> for the hotel booking.
            </span>
            <button
              onClick={requestIdForNeedsHotel}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
            >
              Request IDs
            </button>
          </div>
        )}

        {/* Guest cards */}
        {filteredGuests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center text-gray-500">
            No guests match your filters.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGuests.map((guest, index) => {
              const statusInfo = getStatusInfo(guest.rsvpStatus);
              const name = guest.recipient?.name || 'Unknown Guest';
              const email = guest.recipient?.email || '';
              const phone = guest.recipient?.phoneNumber || guest.recipient?.phone || '';
              const guestId = guest.recipient?._id;
              const docs = guest.idDocuments || [];
              const requested = guest.idRequest?.requested;

              return (
                <div key={guest._id || index} className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">
                          {[guest.salutation, name, guest.suffix].filter(Boolean).join(' ')}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          <span className={`w-2 h-2 rounded-full mr-1.5 ${statusInfo.dot}`}></span>
                          {statusInfo.label}
                        </span>
                        <span className="text-xs text-gray-500">· {guest.expectedCount ?? 1} expected</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5">
                        {[email, phone].filter(Boolean).join(' · ') || 'No contact'}
                      </div>
                      {(guest.tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {guest.tags.map(t => (
                            <span key={t} className="text-xs px-2 py-0.5 bg-teal-100 text-teal-800 rounded-full">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {guest.checkedIn ? (
                        <button
                          onClick={() => undoCheckInGuest(guestId)}
                          className="text-sm text-green-700 font-medium"
                          title="Checked in — click to undo"
                        >
                          ✓ Arrived
                        </button>
                      ) : (
                        <button
                          onClick={() => checkInGuest(guestId)}
                          className="text-sm bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-md font-medium"
                        >
                          Check in
                        </button>
                      )}
                      <button onClick={() => openManage(guest)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                        Manage
                      </button>
                      <button
                        onClick={() => handleRemoveGuest(guestId, name)}
                        disabled={removingGuest === guestId}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {removingGuest === guestId ? '…' : 'Remove'}
                      </button>
                    </div>
                  </div>

                  {/* ID collection row (premium) */}
                  {isPremium && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                      {docs.length > 0 ? (
                        <>
                          <span className="text-xs text-green-700 font-medium">✓ ID submitted:</span>
                          {docs.map((d) => (
                            <span key={d._id} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full px-2 py-1">
                              <button onClick={() => viewDocument(guestId, d._id)} className="text-indigo-600 hover:underline">
                                {d.label || 'View'} 🔒
                              </button>
                              <button onClick={() => deleteDocument(guestId, d._id)} className="text-red-500 hover:text-red-700">✕</button>
                            </span>
                          ))}
                        </>
                      ) : requested ? (
                        <>
                          <span className="text-xs text-amber-700">⏳ ID requested — waiting for guest to upload</span>
                          <button
                            onClick={() => cancelIdRequest(guest)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Cancel request
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => requestId(guest)}
                          className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-medium"
                        >
                          Request ID
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-500">
          Showing {filteredGuests.length} of {guests.length} guests
        </div>
      </div>

      {/* Webcam QR scanner */}
      {scanning && (
        <CheckinScanner onDetected={handleScanned} onClose={() => setScanning(false)} />
      )}

      {/* Manage guest modal */}
      {managing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Manage {managing.recipient?.name || 'guest'}
              </h2>
              <button onClick={() => setManaging(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_TAGS.map(t => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`text-xs px-3 py-1 rounded-full border ${tagDraft.includes(t) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-700 border-gray-300'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            {/* Custom tags currently applied but not in presets */}
            {tagDraft.filter(t => !PRESET_TAGS.includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {tagDraft.filter(t => !PRESET_TAGS.includes(t)).map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-teal-100 text-teal-800 rounded-full">
                    {t}
                    <button onClick={() => toggleTag(t)} className="text-teal-600">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
                placeholder="Add custom tag"
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
              <button onClick={addCustomTag} className="px-3 py-1.5 bg-gray-100 rounded-md text-sm">Add</button>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expected people <span className="text-xs font-normal text-gray-500">(host only)</span>
            </label>
            <input
              type="number"
              min="0"
              value={expectedDraft}
              onChange={(e) => setExpectedDraft(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-5"
            />

            <div className="flex gap-2">
              <button
                onClick={saveManage}
                disabled={savingManage}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-md font-medium"
              >
                {savingManage ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setManaging(null)} className="px-4 py-2 text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'text-gray-900',
    green: 'text-green-600',
    red: 'text-red-600',
    gray: 'text-gray-500',
    indigo: 'text-indigo-600',
  };
  return (
    <div className="bg-white rounded-lg shadow-sm p-3 text-center">
      <div className={`text-2xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
};

export default HostGuestList;
