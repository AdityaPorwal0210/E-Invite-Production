import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const SavedEvents = () => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  
  const navigate = useNavigate();

  useEffect(() => {
    fetchSavedInvitations();
  }, []);

  const fetchSavedInvitations = async () => {
    try {
      const response = await api.get('/invitations/saved');
      setInvitations(response.data.invitations || []);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch saved invitations');
      setLoading(false);
    }
  };

  const handleUnsave = async (e, invitationId) => {
    e.stopPropagation();
    try {
      await api.put(`/invitations/${invitationId}/save`);
      // Remove from local state
      setInvitations(prev => prev.filter(inv => inv._id !== invitationId));
    } catch (err) {
      console.error('Failed to unsave:', err);
    }
  };

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
            Saved Events
          </h1>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Back to Dashboard
          </button>
        </div>

        <p className="text-gray-600 mb-8">
          Events you've saved for later
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
            <div className="text-8xl mb-6">⭐</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              No saved events yet
            </h2>
            <p className="text-gray-600 mb-4 text-lg">
              {activeTab === 'upcoming' 
                ? "You haven't saved any events for later." 
                : "Your past saved events will appear here."}
            </p>
            <p className="text-gray-500">
              {activeTab === 'upcoming' 
                ? "Save events from your Inbox to see them here!" 
                : null}
            </p>
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
                      src={invitation.coverImage} 
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

export default SavedEvents;
