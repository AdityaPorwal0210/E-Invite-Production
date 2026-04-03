import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import PhoneSyncBanner from './PhoneSyncBanner'; // <-- IMPORT ADDED HERE

const Dashboard = () => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  
  const { logout, user, notificationCounts } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete your account? This will permanently delete all your events and remove you from other events. This action cannot be undone."
    );
    
    if (!confirmDelete) return;
    
    const confirmAgain = window.confirm(
      "WARNING: All your hosted events will be deleted. Are you absolutely sure?"
    );
    
    if (!confirmAgain) return;
    
    try {
      await api.delete('/users/profile');
      logout();
      navigate('/login');
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert(err.response?.data?.message || 'Failed to delete account');
    }
  };

  useEffect(() => {
    const fetchInvitations = async () => {
      try {
        const response = await api.get('/invitations');
        // API returns { count, invitations } - extract the array
        setInvitations(response.data.invitations || []);
        setLoading(false);
      } catch (err) {
        setError(err.message || 'Failed to fetch invitations');
        setLoading(false);
      }
    };

    fetchInvitations();
  }, []);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Filter events into upcoming and past
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEvents = invitations.filter(event => new Date(event.eventDate) >= today);
  const pastEvents = invitations.filter(event => new Date(event.eventDate) < today);

  const displayedEvents = activeTab === 'upcoming' ? upcomingEvents : pastEvents;

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
        <div className="text-xl text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        
        {/* ADDED PHONE SYNC BANNER HERE */}
        <PhoneSyncBanner />

        {/* Header with Create Event and Logout */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">
            Event Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/inbox')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium relative"
            >
              Inbox
              {notificationCounts.pendingInvites > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {notificationCounts.pendingInvites}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/saved')}
              className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors text-sm font-medium"
            >
              Saved
            </button>
            <button
              onClick={() => navigate('/groups')}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm font-medium relative"
            >
              Groups
              {notificationCounts.pendingGroupRequests > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {notificationCounts.pendingGroupRequests}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/create-event')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
            >
              Create New Event
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              {user?.profileImage ? (
                <img 
                  src={user.profileImage?.replace('http://', 'https://')} 
                  alt={user?.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
                </div>
              )}
              <span>{user?.name || 'User'}</span>
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        {invitations.length > 0 && (
          <div className="flex space-x-4 mb-6 border-b">
            <button 
              onClick={() => setActiveTab('upcoming')} 
              className={`pb-2 px-1 font-medium text-sm ${activeTab === 'upcoming' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Upcoming ({upcomingEvents.length})
            </button>
            <button 
              onClick={() => setActiveTab('past')} 
              className={`pb-2 px-1 font-medium text-sm ${activeTab === 'past' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Past ({pastEvents.length})
            </button>
          </div>
        )}
        
        {displayedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-8xl mb-6">🎉</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Let's get the party started!
            </h2>
            <p className="text-gray-600 mb-8 text-lg">
              {activeTab === 'upcoming' 
                ? "You haven't created any upcoming events yet." 
                : "No past events found."}
            </p>
            {activeTab === 'upcoming' && (
              <button
                onClick={() => navigate('/create-event')}
                className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Create Your First Event
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedEvents.map((invitation) => (
              <div 
                key={invitation._id} 
                onClick={() => navigate(`/invitation/${invitation._id}`)}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer"
              >
                {/* Cover Image */}
                <div className="h-48 bg-gray-200 w-full">
                  {invitation.coverImage ? (
                    <img 
                      src={invitation.coverImage?.replace('http://', 'https://')} 
                      alt={invitation.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-300">
                      <span className="text-gray-500">No Image</span>
                    </div>
                  )}
                </div>
                
                {/* Card Content */}
                <div className="p-4">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    {invitation.title}
                  </h2>
                  
                  <p className="text-sm text-gray-500 mb-2">
                    {formatDate(invitation.eventDate)}
                  </p>
                  
                  <p className="text-sm text-gray-600 mb-2">
                    📍 {invitation.location}
                  </p>
                  
                  <p className="text-sm text-gray-500">
                    Hosted by: {invitation.host?.name || 'Unknown'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;