import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../utils/api';

const PublicGroupJoin = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchGroup();
  }, [id]);

  const fetchGroup = async () => {
    try {
      const response = await api.get(`/groups/${id}`);
      setGroup(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Group not found');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
        <div className="text-xl text-white">Loading...</div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Group Not Found</h1>
          <p className="text-gray-600">{error || 'This group does not exist.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-indigo-600 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Group Info Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">👥</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {group.name}
              </h1>
              <p className="text-gray-600">
                {group.description || 'A group on E-Invite'}
              </p>
            </div>

            <div className="flex justify-center gap-4 mb-6 text-sm text-gray-500">
              <span>👤 {group.owner?.name || 'Unknown'} (Owner)</span>
              <span>•</span>
              <span>👥 {group.members?.length || 0} Members</span>
            </div>

            {/* CTA for non-logged in users */}
            <div className="border-t pt-6 mt-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  You've been invited to join! 🎉
                </h2>
                <p className="text-gray-600 mb-6">
                  Create an account to join this group and receive event invitations
                </p>
                
                <div className="space-y-3">
                  <Link
                    to="/register"
                    className="block w-full py-3 bg-indigo-600 text-white text-lg font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg"
                  >
                    📝 Create Account to Join
                  </Link>
                  
                  <p className="text-sm text-gray-500">
                    Already have an account?{' '}
                    <Link to="/login" className="font-semibold text-indigo-600 hover:underline">
                      Sign In
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* App Info */}
        <div className="text-center mt-8">
          <p className="text-white/80 text-sm">
            E-Invite - Send and manage event invitations easily
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicGroupJoin;
