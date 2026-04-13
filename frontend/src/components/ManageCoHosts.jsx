import { useState, useEffect, useRef, useContext } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const ManageCoHosts = ({ 
  invitation, 
  onClose, 
  onDelegatesUpdated,
  showCoHostModal,
  setShowCoHostModal 
}) => {
  const { user } = useContext(AuthContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDelegates, setSelectedDelegates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const searchTimeoutRef = useRef(null);

  // Initialize selected delegates with existing delegates
  useEffect(() => {
    if (invitation?.delegates) {
      // Handle both populated and non-populated delegates
      const existingDelegates = invitation.delegates.map(d => ({
        _id: d._id || d,
        name: d.name || 'Unknown User',
        email: d.email || ''
      }));
      setSelectedDelegates(existingDelegates);
    }
  }, [invitation]);

  // Search users when query changes
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!showCoHostModal || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, showCoHostModal]);

  const searchUsers = async (query) => {
    setIsSearching(true);
    try {
      const response = await api.get(`/users/search?query=${encodeURIComponent(query)}`);
      
      // Filter out current user and already selected delegates
      const currentUserId = user?._id?.toString() || user?.id?.toString();
      const selectedIds = selectedDelegates.map(d => (d._id?.toString() || d._id));
      
      const filtered = response.data.filter(u => {
        const userId = u._id?.toString() || u.id?.toString();
        return userId !== currentUserId && !selectedIds.includes(userId);
      });

      setSearchResults(filtered);
    } catch (err) {
      console.error('Failed to search users:', err);
      toast.error('Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  const addDelegate = (userToAdd) => {
    // Prevent duplicates
    if (!selectedDelegates.some(d => (d._id?.toString() || d._id) === (userToAdd._id?.toString() || userToAdd._id))) {
      setSelectedDelegates([...selectedDelegates, {
        _id: userToAdd._id,
        name: userToAdd.name,
        email: userToAdd.email
      }]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeDelegate = (delegateId) => {
    setSelectedDelegates(selectedDelegates.filter(d => (d._id?.toString() || d._id) !== (delegateId?.toString() || delegateId)));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Extract just the IDs
      const delegateIds = selectedDelegates.map(d => d._id?.toString() || d._id);
      
      const response = await api.put(`/invitations/${invitation._id}/delegates`, {
        delegates: delegateIds
      });

      toast.success('Co-hosts updated successfully!');
      
      // Call callback to refresh parent data
      if (onDelegatesUpdated) {
        onDelegatesUpdated(response.data.delegates);
      }
      
      setShowCoHostModal(false);
    } catch (err) {
      console.error('Failed to update delegates:', err);
      toast.error(err.response?.data?.message || 'Failed to update co-hosts');
    } finally {
      setIsSaving(false);
    }
  };

  if (!showCoHostModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <span className="text-xl">👑</span>
              </div>
              <div>
                <h2 className="text-xl font-bold">Manage Co-Hosts</h2>
                <p className="text-purple-200 text-sm">Assign delegates to help manage this event</p>
              </div>
            </div>
            <button 
              onClick={() => setShowCoHostModal(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Search Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search for users
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type name or email..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            
            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((u) => (
                  <button
                    key={u._id}
                    onClick={() => addDelegate(u)}
                    className="w-full text-left px-4 py-3 hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{u.name}</p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                      </div>
                      <span className="text-purple-600 text-lg">➕</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
              <p className="mt-2 text-sm text-gray-500 text-center">No users found</p>
            )}
          </div>

          {/* Selected Co-Hosts */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span>Current Co-Hosts</span>
              <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                {selectedDelegates.length}
              </span>
            </h3>
            
            {selectedDelegates.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <span className="text-4xl text-gray-300 mx-auto mb-2 block">👤</span>
                <p className="text-gray-500 text-sm">No co-hosts assigned yet</p>
                <p className="text-gray-400 text-xs mt-1">Search and add users above</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedDelegates.map((delegate) => {
                  const delegateId = delegate._id?.toString() || delegate._id;
                  return (
                    <div 
                      key={delegateId} 
                      className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="bg-purple-100 p-2 rounded-full flex-shrink-0">
                          <span className="text-purple-600 font-semibold text-sm">
                            {delegate.name?.charAt(0)?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{delegate.name}</p>
                          <p className="text-xs text-gray-500 truncate">{delegate.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeDelegate(delegateId)}
                        className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        title="Remove co-host"
                      >
                        <span className="text-lg">✕</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="font-medium text-amber-800 mb-1">Co-hosts can:</h4>
            <ul className="text-xs text-amber-700 space-y-1">
              <li className="flex items-start gap-1">
                <span className="text-green-600">✓</span>
                View and manage the guest list
              </li>
              <li className="flex items-start gap-1">
                <span className="text-green-600">✓</span>
                Invite new guests to the event
              </li>
              <li className="flex items-start gap-1">
                <span className="text-green-600">✓</span>
                See real-time RSVP updates
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <div className="flex gap-3">
            <button
              onClick={() => setShowCoHostModal(false)}
              className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span className="text-lg">✓</span>
                  <span>Save Co-Hosts</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageCoHosts;
