import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const Inbox = () => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  
  const { user, fetchNotificationCounts } = useContext(AuthContext);
  const navigate = useNavigate();

  const fetchReceivedInvitations = async () => {
    try {
      const response = await api.get('/invitations/received');
      setInvitations(response.data.invitations || []);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch invitations');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceivedInvitations();
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">
            My Inbox
          </h1>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Back to Dashboard
          </button>
        </div>

        <p className="text-gray-600 mb-8">
          Events shared with groups you're in or directly invited to
        </p>
        
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
            <div className="text-8xl mb-6">📬</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Your inbox is empty
            </h2>
            <p className="text-gray-600 mb-4 text-lg">
              {activeTab === 'upcoming' 
                ? "Waiting for the invites to roll in!" 
                : "Your past invitations will appear here."}
            </p>
            <p className="text-gray-500">
              {activeTab === 'upcoming' 
                ? "When events are shared with your groups or you're directly invited, they'll appear here." 
                : null}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedEvents.map((invitation) => (
              <div 
                key={invitation._id} 
                onClick={async () => {
                  // Navigate to invitation detail, then refresh inbox and counts when coming back
                  await navigate(`/invitation/${invitation._id}`);
                  // After returning, refetch inbox and counts
                  fetchReceivedInvitations();
                  fetchNotificationCounts();
                }}
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
                <div className="p-4 relative">
                  {!invitation.isRead && (
                    <span className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                      NEW
                    </span>
                  )}
                  <h2 className="text-xl font-semibold text-gray-900 mb-2 pr-16">
                    {invitation.title}
                  </h2>
                  
                  <p className="text-sm text-gray-500 mb-2">
                    {formatDate(invitation.eventDate)}
                  </p>
                  
                  <p className="text-sm text-gray-600 mb-2">
                    📍 {invitation.location}
                  </p>
                  
                  <div className="flex flex-wrap gap-1 mt-3">
                    <p className="text-sm text-gray-500 mr-2">
                      From: {invitation.host?.name || 'Unknown'}
                    </p>
                    {invitation.sharedGroups && invitation.sharedGroups.map((group) => (
                      <span 
                        key={group._id} 
                        className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded"
                      >
                        {group.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
