import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const GroupDetails = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  // Helper to safely extract string ID from various formats
  const getStringId = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value._id) return value._id.toString();
    return value.toString();
  };

  const currentUserId = getStringId(user?._id) || getStringId(user?.id);
  const ownerId = getStringId(group?.owner);

  // STRICT BOOLEAN CHECKS: Ensure neither is null before comparing
  const isOwner = Boolean(currentUserId && ownerId && currentUserId === ownerId);

  const isMember = Boolean(
    currentUserId && 
    group?.members?.some(m => getStringId(m) === currentUserId)
  );

  const hasPendingRequest = Boolean(
    currentUserId && 
    group?.joinRequests?.some(r => getStringId(r) === currentUserId)
  );

  // THE TRUTH SERUM: Add this temporarily so you can see exactly what React sees
  console.log("LOGGED IN AS:", currentUserId, "| GROUP OWNER IS:", ownerId, "| IS OWNER?", isOwner);

  useEffect(() => {
    fetchGroup();
  }, [id]);

  const fetchGroup = async () => {
    try {
      const response = await api.get(`/groups/${id}`);
      setGroup(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch group');
      setLoading(false);
    }
  };

  const copyJoinLink = () => {
    const joinLink = `${window.location.origin}/groups/join/${id}`;
    navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleJoin = async () => {
    try {
      await api.post(`/groups/${id}/join`);
      alert('Join request sent!');
      fetchGroup();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join');
    }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return;
    try {
      await api.post(`/groups/${id}/leave`);
      navigate('/groups');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to leave');
    }
  };

  const approveRequest = async (userId) => {
    try {
      await api.post(`/groups/${id}/approve/${userId}`);
      fetchGroup();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve');
    }
  };

  const rejectRequest = async (userId) => {
    try {
      await api.post(`/groups/${id}/reject/${userId}`);
      fetchGroup();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error && !group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">{group.name}</h1>
          <button
            onClick={() => navigate('/groups')}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Back to Groups
          </button>
        </div>

        {error && <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <p className="text-gray-600 mb-4">{group.description || 'No description'}</p>
          <div className="flex justify-between text-sm text-gray-500 mb-6">
            <span>Owner: {group.owner?.name || 'Unknown'}</span>
            <span>{group.members?.length || 0} members</span>
          </div>

          {/* Owner Actions - Copy Join Link */}
          {isOwner && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2">Owner Actions</h3>
              <button
                onClick={copyJoinLink}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                {copied ? '✓ Link Copied!' : '📋 Copy Join Link'}
              </button>
              {copied && (
                <p className="mt-2 text-sm text-green-600">
                  Invite link copied! Share it with people you want to invite.
                </p>
              )}
            </div>
          )}

          {/* Member Actions - Leave Group */}
          {isMember && !isOwner && (
            <button
              onClick={handleLeave}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Leave Group
            </button>
          )}

          {/* Join Button - Only show if NOT a member, NOT owner, and NO pending request */}
          {!isMember && !isOwner && !hasPendingRequest && (
            <button
              onClick={handleJoin}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Request to Join
            </button>
          )}

          {/* Already requested message */}
          {hasPendingRequest && (
            <p className="text-yellow-600 font-medium">
              ⏳ Your join request is pending approval from the group owner.
            </p>
          )}
        </div>

        {/* Pending Requests Section - Owner Only */}
        {isOwner && group.joinRequests?.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="font-semibold mb-4">Pending Requests ({group.joinRequests.length})</h3>
            {group.joinRequests.map((request) => {
              const requestId = getStringId(request);
              return (
                <div key={requestId} className="flex justify-between items-center py-3 border-b last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      {(request.name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{request.name || 'Unknown User'}</p>
                      <p className="text-sm text-gray-500">{request.email || ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveRequest(requestId)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectRequest(requestId)}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Members List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="font-semibold mb-4">Members ({group.members?.length || 0})</h3>
          <div className="space-y-3">
            {group.members?.map((member) => {
              const memberId = getStringId(member);
              const isMemberOwner = memberId === ownerId;
              
              return (
                <div key={memberId} className="flex items-center justify-between py-3 border-b last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold">
                      {(member.name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{member.name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">{member.email || ''}</p>
                    </div>
                  </div>
                  {isMemberOwner && (
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm font-medium rounded-full">
                      Owner
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupDetails;