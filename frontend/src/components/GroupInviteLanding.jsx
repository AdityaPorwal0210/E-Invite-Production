import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const GroupInviteLanding = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchGroupInfo();
  }, [id]);

  const fetchGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${id}/public`);
      setGroup(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Group not found');
      setLoading(false);
    }
  };

  const handleRequestToJoin = async () => {
    setProcessing(true);
    try {
      await api.post(`/groups/${id}/request`);
      setRequestSent(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send request');
    }
    setProcessing(false);
  };

  const getReturnTo = () => {
    return location.pathname;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Group Not Found</h1>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-8">
            <h1 className="text-3xl font-bold text-white text-center">
              {group?.name}
            </h1>
            {group?.description && (
              <p className="text-indigo-100 text-center mt-2">
                {group.description}
              </p>
            )}
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="text-center mb-6">
              <p className="text-gray-600">
                Managed by: <strong>{group?.owner}</strong>
              </p>
              {group?.admins?.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  Admins: {group.admins.join(', ')}
                </p>
              )}
            </div>

            {/* Actions based on auth state */}
            {!user ? (
              <div className="space-y-3">
                <p className="text-center text-gray-600 mb-4">
                  Log in or create an account to join this group
                </p>
                <button
                  onClick={() => navigate(`/login?returnTo=${getReturnTo()}`)}
                  className="w-full px-4 py-3 bg-white border-2 border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
                >
                  Log In
                </button>
                <button
                  onClick={() => navigate(`/register?returnTo=${getReturnTo()}`)}
                  className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                >
                  Create Account
                </button>
              </div>
            ) : group?.joinSetting === 'invite_only' ? (
              <div className="text-center p-4 bg-gray-100 rounded-lg">
                <p className="text-gray-700 font-medium">
                  🔒 This group is invite-only
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  You need to be invited by a group admin to join
                </p>
              </div>
            ) : group?.joinSetting === 'request_to_join' ? (
              <div className="space-y-3">
                {requestSent ? (
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <p className="text-yellow-800 font-medium">
                      ✓ Request Sent
                    </p>
                    <p className="text-sm text-yellow-600 mt-1">
                      Waiting for approval from group admin
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-center text-gray-600 mb-4">
                      This group allows members to join by request
                    </p>
                    <button
                      onClick={handleRequestToJoin}
                      disabled={processing}
                      className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {processing ? 'Sending...' : 'Request to Join'}
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <button
              onClick={() => navigate('/')}
              className="w-full mt-4 px-4 py-2 text-gray-500 hover:text-gray-700"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupInviteLanding;
