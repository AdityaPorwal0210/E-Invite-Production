import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../utils/api';

const PhoneSyncBanner = () => {
  const { user, login } = useContext(AuthContext); 
  const [step, setStep] = useState(1); // 1 = Phone Number, 2 = OTP
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // LOGIC CHECK: Do not render if the user already has a verified phone number
  // or if they manually dismissed the banner for this session.
  if (user?.isPhoneVerified || user?.phoneNumber || isDismissed) {
    return null;
  }

  // STEP 1: Request the OTP
  const handleRequestSync = async (e) => {
    e.preventDefault();
    
    // Basic validation to ensure they typed at least something resembling a phone number
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/users/sync-phone/request', { phoneNumber: cleanPhone });
      toast.success(response.data.message || 'OTP sent! Check your phone.');
      setStep(2); // Move to OTP input
    } catch (err) {
      console.error("Sync Request Error:", err);
      toast.error(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify the OTP and execute the merge
  const handleVerifySync = async (e) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      toast.error('Please enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/users/sync-phone/verify', { otp });
      
      toast.success(response.data.message || 'Phone linked and invites synced!');
      
      // Update the local AuthContext so the banner disappears permanently
      const token = localStorage.getItem('token'); 
      if (token && login) {
         login(token, { 
           ...user, 
           phoneNumber: response.data.phoneNumber,
           isPhoneVerified: true 
         });
      } else {
         setIsDismissed(true); // Fallback to just hiding it if login context fails
      }

      // If they had events waiting, a page reload might be nice to fetch the new invites
      setTimeout(() => window.location.reload(), 1500);

    } catch (err) {
      console.error("Sync Verify Error:", err);
      toast.error(err.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-6 rounded-r-md shadow-sm transition-all duration-300">
      <div className="sm:flex sm:items-start sm:justify-between">
        
        {/* Text Section */}
        <div>
          <h3 className="text-sm font-bold text-indigo-800">
            {step === 1 ? 'Missing an invitation?' : 'Verify your phone'}
          </h3>
          <div className="mt-1 text-sm text-indigo-700">
            <p>
              {step === 1 
                ? 'If you received an SMS invite, link your phone number to automatically sync your events to this dashboard.'
                : `We sent a code to ${phoneNumber}. Enter it below to sync your events.`}
            </p>
          </div>
        </div>
        
        {/* Form Section */}
        <div className="mt-4 sm:mt-0 sm:ml-6 sm:flex-shrink-0 sm:flex sm:items-center">
          
          {step === 1 ? (
            // STEP 1 FORM: Phone Number Input
            <form onSubmit={handleRequestSync} className="flex rounded-md shadow-sm">
              <input
                type="tel"
                name="phoneNumber"
                id="phoneNumber"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-full rounded-none rounded-l-md sm:text-sm border-gray-300 px-3 py-2 border outline-none"
                placeholder="e.g. 1234567890"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="relative -ml-px inline-flex items-center space-x-2 px-4 py-2 border border-indigo-500 text-sm font-medium rounded-r-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Code'}
              </button>
            </form>
          ) : (
            // STEP 2 FORM: OTP Input
            <form onSubmit={handleVerifySync} className="flex items-center gap-2">
              <div className="flex rounded-md shadow-sm">
                <input
                  type="text"
                  name="otp"
                  id="otp"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} // Numbers only
                  className="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-24 rounded-none rounded-l-md sm:text-sm border-gray-300 px-3 py-2 border outline-none text-center tracking-widest font-mono"
                  placeholder="000000"
                  required
                />
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="relative -ml-px inline-flex items-center space-x-2 px-4 py-2 border border-indigo-500 text-sm font-medium rounded-r-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setStep(1); setOtp(''); }}
                className="text-xs text-indigo-500 hover:text-indigo-800 underline ml-2"
              >
                Change Number
              </button>
            </form>
          )}

        </div>

        {/* Dismiss Button */}
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