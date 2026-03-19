import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  
  // Member management state
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const searchTimeoutRef = useRef(null);
  
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!showManage || userSearch.trim().length < 2) {
      setUserResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(userSearch);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [userSearch, showManage]);

  const fetchGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch groups');
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setCreating(true);
    
    try {
      await api.post('/groups', newGroup);
      toast.success('Group created successfully!');
      setShowCreate(false);
      setNewGroup({ name: '', description: '' });
      fetchGroups();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create group');
      setError(err.response?.data?.message || 'Failed to create group');
    }
    
    setCreating(false);
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group? This cannot be undone.')) return;
    
    try {
      await api.delete(`/groups/${groupId}`);
      fetchGroups();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete group');
    }
  };

  const searchUsers = async (query) => {
    setSearchingUsers(true);
    try {
      const response = await api.get(`/users/search?query=${encodeURIComponent(query)}`);
      // Filter out current user and existing members
      const currentMemberIds = selectedGroup?.members?.map(m => m._id) || [];
      const filtered = response.data.filter(u => 
        u._id !== user._id && !currentMemberIds.includes(u._id)
      );
      setUserResults(filtered);
    } catch (err) {
      console.error('Failed to search users:', err);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleAddMember = async (userId) => {
    try {
      await api.put(`/groups/${selectedGroup._id}/members`, { userId });
      toast.success('Member added successfully!');
      // Refresh group data
      const response = await api.get(`/groups/${selectedGroup._id}`);
      setSelectedGroup(response.data);
      setGroups(prev => prev.map(g => g._id === selectedGroup._id ? response.data : g));
      setUserSearch('');
      setUserResults([]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add member');
      setError(err.response?.data?.message || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Remove this member from the group?')) return;
    
    try {
      await api.delete(`/groups/${selectedGroup._id}/members`, { data: { userId: memberId } });
      // Refresh group data
      const response = await api.get(`/groups/${selectedGroup._id}`);
      setSelectedGroup(response.data);
      setGroups(prev => prev.map(g => g._id === selectedGroup._id ? response.data : g));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleToggleAdmin = async (memberId) => {
    try {
      await api.put(`/groups/${selectedGroup._id}/admins`, { userId: memberId });
      // Refresh group data
      const response = await api.get(`/groups/${selectedGroup._id}`);
      setSelectedGroup(response.data);
      setGroups(prev => prev.map(g => g._id === selectedGroup._id ? response.data : g));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to toggle admin status');
    }
  };

  const handleCopyInviteLink = (groupId) => {
    const link = `${window.location.origin}/group/invite/${groupId}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copied to clipboard!');
  };

  const handleJoinSettingChange = async (newSetting) => {
    try {
      await api.put(`/groups/${selectedGroup._id}/settings`, { joinSetting: newSetting });
      // Refresh group data
      const response = await api.get(`/groups/${selectedGroup._id}`);
      setSelectedGroup(response.data);
      setGroups(prev => prev.map(g => g._id === selectedGroup._id ? response.data : g));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update settings');
    }
  };

  const handleApproveRequest = async (userId) => {
    try {
      await api.put(`/groups/${selectedGroup._id}/requests/handle`, { userId, status: 'approve' });
      // Refresh group data
      const response = await api.get(`/groups/${selectedGroup._id}`);
      setSelectedGroup(response.data);
      setGroups(prev => prev.map(g => g._id === selectedGroup._id ? response.data : g));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve request');
    }
  };

  const handleRejectRequest = async (userId) => {
    try {
      await api.put(`/groups/${selectedGroup._id}/requests/handle`, { userId, status: 'reject' });
      // Refresh group data
      const response = await api.get(`/groups/${selectedGroup._id}`);
      setSelectedGroup(response.data);
      setGroups(prev => prev.map(g => g._id === selectedGroup._id ? response.data : g));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject request');
    }
  };

  const openManageModal = (group) => {
    setSelectedGroup(group);
    setShowManage(true);
    setUserSearch('');
    setUserResults([]);
  };

  const getCurrentUserId = () => user?._id || user?.id;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">My Groups</h1>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Back to Dashboard
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>
        )}

        {/* Create Group Form */}
        {showCreate ? (
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-xl font-semibold mb-4">Create New Group</h2>
            <form onSubmit={handleCreateGroup}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                <input
                  type="text"
                  required
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows="3"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="mb-8 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            + Create New Group
          </button>
        )}

        {/* Groups List - Empty State */}
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-8xl mb-6">👥</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Build your crew!
            </h2>
            <p className="text-gray-600 mb-6 text-lg">
              No groups yet. Create groups to manage guest lists for your events.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
            >
              Create Your First Group
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <div
                key={group._id}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition"
              >
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{group.name}</h3>
                <p className="text-gray-600 text-sm mb-4">{group.description || 'No description'}</p>
                <div className="flex justify-between text-sm text-gray-500 mb-4">
                  <span>Owner: {group.owner?.name || 'Unknown'}</span>
                  <span>{group.members?.length || 0} members</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openManageModal(group)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    Manage
                  </button>
                  {(group.admins?.some(a => a._id === getCurrentUserId()) || group.owner?._id === getCurrentUserId()) && (
                    <button
                      onClick={() => handleCopyInviteLink(group._id)}
                      className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 text-sm"
                      title="Copy Invite Link"
                    >
                      📋
                    </button>
                  )}
                  {group.owner?._id === getCurrentUserId() && (
                    <button
                      onClick={() => handleDeleteGroup(group._id)}
                      className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manage Members Modal */}
      {showManage && selectedGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Manage Members</h2>
                <button
                  onClick={() => setShowManage(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Managing: <strong>{selectedGroup.name}</strong>
              </p>

              {/* Admin Tools - Only for admins */}
              {(selectedGroup.admins?.some(a => a._id === getCurrentUserId()) || selectedGroup.owner?._id === getCurrentUserId()) && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-medium text-gray-700">Admin Tools</h3>
                    <button
                      onClick={() => handleCopyInviteLink(selectedGroup._id)}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      📋 Copy Invite Link
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Join Setting:</label>
                    <select
                      value={selectedGroup.joinSetting || 'invite_only'}
                      onChange={(e) => handleJoinSettingChange(e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="invite_only">Invite Only</option>
                      <option value="request_to_join">Request to Join</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Pending Requests - Only for admins */}
              {(selectedGroup.admins?.some(a => a._id === getCurrentUserId()) || selectedGroup.owner?._id === getCurrentUserId()) && selectedGroup.joinRequests?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Pending Requests ({selectedGroup.joinRequests.length})
                  </h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedGroup.joinRequests.map((request) => (
                      <div 
                        key={request._id} 
                        className="flex justify-between items-center p-3 bg-yellow-50 rounded-md"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{request.name}</p>
                          <p className="text-xs text-gray-500">{request.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApproveRequest(request._id)}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                            title="Approve"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleRejectRequest(request._id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                            title="Reject"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Member Search */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add Members
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  {userResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {userResults.map((u) => (
                        <button
                          key={u._id}
                          type="button"
                          onClick={() => handleAddMember(u._id)}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50"
                        >
                          <p className="text-sm font-medium">{u.name}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Current Members List */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Current Members ({selectedGroup.members?.length || 0})
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedGroup.members?.map((member) => {
                    const isCurrentUserAdmin = selectedGroup.admins?.some(a => a._id === getCurrentUserId()) || selectedGroup.owner?._id === getCurrentUserId();
                    const isMemberAdmin = selectedGroup.admins?.some(a => a._id === member._id);
                    
                    return (
                      <div 
                        key={member._id} 
                        className="flex justify-between items-center p-3 bg-gray-50 rounded-md"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {member.name}
                            {member._id === selectedGroup.owner?._id && (
                              <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">Owner</span>
                            )}
                            {isMemberAdmin && member._id !== selectedGroup.owner?._id && (
                              <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">Admin</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                        {member._id !== selectedGroup.owner?._id && isCurrentUserAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleAdmin(member._id)}
                              className={`p-1 ${isMemberAdmin ? 'text-yellow-500 hover:text-yellow-700' : 'text-gray-400 hover:text-yellow-600'}`}
                              title={isMemberAdmin ? 'Remove Admin' : 'Make Admin'}
                            >
                              {isMemberAdmin ? '★' : '☆'}
                            </button>
                            <button
                              onClick={() => handleRemoveMember(member._id)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Remove member"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setShowManage(false)}
                className="mt-6 w-full px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Groups;
