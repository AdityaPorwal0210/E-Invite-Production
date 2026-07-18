import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useCachedGet, invalidateCache } from '../utils/useCachedGet';

// Common prefixes — host can also type a custom one
const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Mr. & Mrs.', 'Shri', 'Smt.', 'Sh. & Smt.'];
// Trailing forms
const SUFFIXES = ['& Family', 'and Family', '& Co.'];

const emptyGuest = {
  salutation: '',
  name: '',
  suffix: '',
  email: '',
  phone: '',
  expectedCount: 1,
  notes: ''
};

// Mirrors the backend's greeting builder so the preview matches the real invite
const composeDisplayName = (g) =>
  [g.salutation, g.name, g.suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

const GuestListDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyGuest);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyGuest);
  const [busy, setBusy] = useState(false);

  const cacheKey = `guest-list-${id}`;

  const { data: list, loading, error, refetch } = useCachedGet(
    cacheKey,
    async () => (await api.get(`/guest-lists/${id}`)).data
  );

  const refresh = () => {
    invalidateCache(cacheKey);
    invalidateCache('guest-lists'); // counts on the index page changed
    refetch();
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();

    if (!form.name.trim() && !form.email.trim() && !form.phone.trim()) {
      toast.error('Add at least a name, email, or phone');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post(`/guest-lists/${id}/guests`, form);
      toast.success(response.data?.message || `${composeDisplayName(form) || 'Guest'} added`);
      setForm(emptyGuest);
      refresh();
    } catch (err) {
      // 409 = this guest is already in the list
      if (err.response?.status === 409) {
        toast.error(err.response.data?.message || 'This guest is already in the list');
      } else {
        toast.error(err.response?.data?.message || 'Could not add guest');
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (guest) => {
    setEditingId(guest._id);
    setEditForm({
      salutation: guest.salutation || '',
      name: guest.name || '',
      suffix: guest.suffix || '',
      email: guest.email || '',
      phone: guest.phone || '',
      expectedCount: guest.expectedCount ?? 1,
      notes: guest.notes || ''
    });
  };

  const handleSaveEdit = async (guestId) => {
    setBusy(true);
    try {
      await api.put(`/guest-lists/${id}/guests/${guestId}`, editForm);
      toast.success('Guest updated');
      setEditingId(null);
      refresh();
    } catch (err) {
      // 409 = these details would duplicate another guest in the list
      toast.error(err.response?.data?.message || 'Could not update guest');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveGuest = async (guest) => {
    if (!window.confirm(`Remove ${composeDisplayName(guest) || 'this guest'} from the list?`)) return;

    setBusy(true);
    try {
      await api.delete(`/guest-lists/${id}/guests/${guest._id}`);
      toast.success('Guest removed');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove guest');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get(`/guest-lists/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${(list?.name || 'guest-list').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch (err) {
      toast.error('Could not export this list');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading list...</div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <div className="text-xl text-red-600">{error || 'List not found'}</div>
        <button onClick={() => navigate('/guest-lists')} className="text-indigo-600 hover:underline">
          Back to guest lists
        </button>
      </div>
    );
  }

  const guests = list.guests || [];
  const totalExpected = guests.reduce((sum, g) => sum + (g.expectedCount || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <button
          onClick={() => navigate('/guest-lists')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          ← All guest lists
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{list.name}</h1>
            {list.description && <p className="text-gray-600 mt-1">{list.description}</p>}
            <div className="flex gap-4 mt-2 text-sm text-gray-700">
              <span><span className="font-semibold">{guests.length}</span> {guests.length === 1 ? 'guest' : 'guests'}</span>
              <span><span className="font-semibold">{totalExpected}</span> people expected</span>
            </div>
          </div>

          <button
            onClick={handleExport}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition"
          >
            📊 Export CSV
          </button>
        </div>

        {/* Add guest */}
        <form onSubmit={handleAddGuest} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add a guest</h2>

          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Salutation</label>
              <input
                list="salutation-options"
                value={form.salutation}
                onChange={(e) => setForm({ ...form, salutation: e.target.value })}
                placeholder="Mr. & Mrs."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <datalist id="salutation-options">
                {SALUTATIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sharma"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Suffix</label>
              <input
                list="suffix-options"
                value={form.suffix}
                onChange={(e) => setForm({ ...form, suffix: e.target.value })}
                placeholder="& Family"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <datalist id="suffix-options">
                {SUFFIXES.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>

          {/* Live preview of how the invite will address them */}
          {composeDisplayName(form) && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2 mb-4 text-sm text-indigo-900">
              Invite will read: <span className="font-semibold">Dear {composeDisplayName(form)}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="guest@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expected people
                <span className="ml-1 text-xs font-normal text-gray-500">(host only)</span>
              </label>
              <input
                type="number"
                min="0"
                value={form.expectedCount}
                onChange={(e) => setForm({ ...form, expectedCount: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg font-medium transition"
          >
            {saving ? 'Adding...' : '+ Add Guest'}
          </button>
        </form>

        {/* Guests */}
        {guests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center">
            <div className="text-5xl mb-3">👥</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No guests yet</h3>
            <p className="text-gray-600">Add your first guest using the form above.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {guests.map((guest, index) => (
              <div
                key={guest._id}
                className={`p-4 ${index !== guests.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                {editingId === guest._id ? (
                  /* Edit mode */
                  <div>
                    <div className="grid gap-3 sm:grid-cols-3 mb-3">
                      <input
                        list="salutation-options"
                        value={editForm.salutation}
                        onChange={(e) => setEditForm({ ...editForm, salutation: e.target.value })}
                        placeholder="Salutation"
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Name"
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        list="suffix-options"
                        value={editForm.suffix}
                        onChange={(e) => setEditForm({ ...editForm, suffix: e.target.value })}
                        placeholder="Suffix"
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 mb-3">
                      <input
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="Email"
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        placeholder="Phone"
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="number"
                        min="0"
                        value={editForm.expectedCount}
                        onChange={(e) => setEditForm({ ...editForm, expectedCount: e.target.value })}
                        placeholder="Expected"
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(guest._id)}
                        disabled={busy}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-gray-600 hover:text-gray-800 px-3 py-1.5 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Read mode */
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">
                        {composeDisplayName(guest) || 'Unnamed guest'}
                        {guest.user && (
                          <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                            app user
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {[guest.email, guest.phone].filter(Boolean).join(' · ') || 'No contact details'}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 whitespace-nowrap">
                        <span className="font-semibold">{guest.expectedCount ?? 1}</span> expected
                      </span>
                      <button
                        onClick={() => startEdit(guest)}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemoveGuest(guest)}
                        disabled={busy}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuestListDetail;
