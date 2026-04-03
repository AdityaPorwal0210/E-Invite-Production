import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../utils/api';

const PhoneSyncBanner = () => {
  const { user, login } = useContext(AuthContext); 
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // LOGIC CHECK: Do not render if the user already has a phone number linked
  // or if they manually dismissed the banner for this session.
  if (user?.phoneNumber || isDismissed) {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.length < 5) {
      toast.error('Please enter a valid phone number');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/users/sync-phone', { phoneNumber });
      
      toast.success(response.data.message || 'Phone linked and invites synced!');
      
      // Update the local AuthContext so the banner disappears permanently
      // Assuming your login function takes (token, userObject)
      const token = localStorage.getItem('token'); 
      if (token && login) {
         login(token, { ...user, phoneNumber: phoneNumber.replace(/[^0-9+]/g, '') });
      } else {
         setIsDismissed(true); // Fallback to just hiding it
      }

    } catch (err) {
      console.error("Sync Error:", err);
      toast.error(err.response?.data?.message || 'Failed to sync phone number');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-6 rounded-r-md shadow-sm">
      <div className="sm:flex sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-indigo-800">
            Missing an invitation?
          </h3>
          <div className="mt-1 text-sm text-indigo-700">
            <p>
              If you received an SMS invite, link your phone number to automatically sync your events to this dashboard.
            </p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="mt-4 sm:mt-0 sm:ml-6 sm:flex-shrink-0 sm:flex sm:items-center">
          <div className="flex rounded-md shadow-sm">
            <input
              type="tel"
              name="phoneNumber"
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-full rounded-none rounded-l-md sm:text-sm border-gray-300 px-3 py-2 border"
              placeholder="e.g. 1234567890"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="relative -ml-px inline-flex items-center space-x-2 px-4 py-2 border border-indigo-500 text-sm font-medium rounded-r-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </form>

        <div className="mt-4 sm:mt-0 sm:ml-4 flex-shrink-0">
          <button
            onClick={() => setIsDismissed(true)}
            type="button"
            className="inline-flex rounded-md bg-indigo-50 text-indigo-500 hover:text-indigo-600 focus:outline-none"
          >
            <span className="sr-only">Dismiss</span>
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhoneSyncBanner;