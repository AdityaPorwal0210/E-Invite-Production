import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useCachedGet, invalidateCache } from '../utils/useCachedGet';

const CACHE_KEY = 'guest-lists';

const GuestLists = () => {
  const navigate = useNavigate();

  const [showCreate, setShowCreate] = useState(false);
  const [newList, setNewList] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const { data: lists = [], loading, error, refetch } = useCachedGet(
    CACHE_KEY,
    async () => {
      const response = await api.get('/guest-lists');
      return response.data.lists || [];
    }
  );

  const refresh = () => {
    invalidateCache(CACHE_KEY);
    refetch();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newList.name.trim()) {
      toast.error('Please give the list a name');
      return;
    }

    setCreating(true);
    try {
      const response = await api.post('/guest-lists', {
        name: newList.name.trim(),
        description: newList.description.trim()
      });
      toast.success(`"${response.data.name}" created`);
      setNewList({ name: '', description: '' });
      setShowCreate(false);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not create the list');
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (list) => {
    setBusyId(list._id);
    try {
      await api.post(`/guest-lists/${list._id}/duplicate`);
      toast.success(`Copied "${list.name}"`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not duplicate the list');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (list) => {
    if (!window.confirm(`Delete "${list.name}"? This cannot be undone.`)) return;

    setBusyId(list._id);
    try {
      await api.delete(`/guest-lists/${list._id}`);
      toast.success(`Deleted "${list.name}"`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete the list');
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = async (list) => {
    setBusyId(list._id);
    try {
      const response = await api.get(`/guest-lists/${list._id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch (err) {
      toast.error('Could not export this list');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading guest lists...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <button
              onClick={() => navigate('/')}
              className="text-sm text-gray-500 hover:text-gray-700 mb-2"
            >
              ← Back to dashboard
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Guest Lists</h1>
          </div>

          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition"
          >
            {showCreate ? 'Cancel' : '+ New List'}
          </button>
        </div>

        <p className="text-gray-600 mb-6">
          Build reusable lists for each function — Reception, DJ Night, After Party — then invite a whole
          list to any event in one tap.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create a new list</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">List name *</label>
              <input
                type="text"
                value={newList.name}
                onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                placeholder="e.g. Reception"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
              <input
                type="text"
                value={newList.description}
                onChange={(e) => setNewList({ ...newList, description: e.target.value })}
                placeholder="e.g. Close family and relatives"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              {creating ? 'Creating...' : 'Create List'}
            </button>
          </form>
        )}

        {/* Lists */}
        {lists.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center">
            <div className="text-5xl mb-3">📋</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No guest lists yet</h3>
            <p className="text-gray-600 mb-4">
              Create your first list to start collecting guests for a function.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              + New List
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lists.map((list) => (
              <div
                key={list._id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition"
              >
                <button
                  onClick={() => navigate(`/guest-lists/${list._id}`)}
                  className="text-left w-full"
                >
                  <h3 className="text-lg font-semibold text-gray-900 hover:text-indigo-600 transition">
                    {list.name}
                  </h3>
                  {list.description && (
                    <p className="text-sm text-gray-600 mt-1">{list.description}</p>
                  )}

                  <div className="flex gap-4 mt-3 text-sm">
                    <span className="text-gray-700">
                      <span className="font-semibold">{list.guestCount}</span>{' '}
                      {list.guestCount === 1 ? 'guest' : 'guests'}
                    </span>
                    <span className="text-gray-700">
                      <span className="font-semibold">{list.totalExpected}</span> expected
                    </span>
                  </div>
                </button>

                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => navigate(`/guest-lists/${list._id}`)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Open
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => handleExport(list)}
                    disabled={busyId === list._id}
                    className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
                  >
                    Export CSV
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => handleDuplicate(list)}
                    disabled={busyId === list._id}
                    className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDelete(list)}
                    disabled={busyId === list._id}
                    className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuestLists;
