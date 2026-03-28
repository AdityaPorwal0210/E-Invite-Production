import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

// Get API URL from environment variable with fallback
const API_URL = import.meta.env.VITE_API_URL || 'https://invitoinbox.onrender.com';

const PublicInvite = () => {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEvent();
  }, [id]);

  const fetchEvent = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/invitations/public/${id}`);
      setEvent(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Event not found');
      setLoading(false);
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
          <h1 className="text-2xl font-bold text-red-600 mb-4">Event Not Found</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Event Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Cover Image */}
          <div className="h-64 bg-gray-200 relative">
            {event.coverImage ? (
              <img 
                src={event.coverImage} 
                alt={event.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-300">
                <span className="text-4xl">📅</span>
              </div>
            )}
          </div>
          
          {/* Event Details */}
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {event.title}
            </h1>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center text-gray-600">
                <span className="text-xl mr-3">📅</span>
                <span className="font-medium">{formatDate(event.eventDate)}</span>
              </div>
              
              <div className="flex items-center text-gray-600">
                <span className="text-xl mr-3">📍</span>
                <span className="font-medium">{event.location}</span>
              </div>
              
              {event.host && (
                <div className="flex items-center text-gray-600">
                  <span className="text-xl mr-3">👤</span>
                  <span className="font-medium">Hosted by {event.host.name}</span>
                </div>
              )}
            </div>

            {/* RSVP CTA */}
            <div className="border-t pt-6 mt-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  You're Invited! 🎉
                </h2>
                <p className="text-gray-600 mb-6">
                  Download the app to RSVP and manage your events
                </p>
                
                <button className="w-full py-4 bg-indigo-600 text-white text-lg font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg">
                  📱 Download App to RSVP
                </button>
                
                <p className="mt-4 text-sm text-gray-500">
                  Available on iOS and Android
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Login Link */}
        <div className="text-center mt-8">
          <p className="text-white/80">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-white hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicInvite;
