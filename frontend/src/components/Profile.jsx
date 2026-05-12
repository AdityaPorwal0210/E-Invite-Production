import { useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const Profile = () => {
  const { logout, user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phoneNumber: user?.phoneNumber || '',
    secondaryPhone: user?.secondaryPhone || '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [secondaryOtpStep, setSecondaryOtpStep] = useState(false);
  const [secondaryOtp, setSecondaryOtp] = useState('');
  const [secondarySyncing, setSecondarySyncing] = useState(false);

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      // Create FormData and upload to /api/upload
      const uploadData = new FormData();
      uploadData.append('image', file);

      const uploadResponse = await api.post('/upload', uploadData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const imageUrl = uploadResponse.data.url;

      // Now update the user profile with the new image URL
      const profileResponse = await api.put('/users/profile', {
        profileImage: imageUrl,
      });

      // Update context with new user data
      setUser(profileResponse.data);
      toast.success('Profile picture updated!');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.message || 'Failed to upload image');
      setError(err.response?.data?.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.put('/users/profile', formData);
      setUser(response.data);
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestSecondarySync = async () => {
    if (!formData.secondaryPhone.trim()) {
      setError('Please enter a secondary phone number first.');
      return;
    }
    setSecondarySyncing(true);
    setError('');
    try {
      await api.post('/users/sync-secondary-phone/request', { phoneNumber: formData.secondaryPhone });
      setSecondaryOtpStep(true);
      setSuccess('OTP sent to your secondary phone number.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP.');
    } finally {
      setSecondarySyncing(false);
    }
  };

  const handleVerifySecondarySync = async () => {
    if (!secondaryOtp.trim()) return;
    setSecondarySyncing(true);
    setError('');
    try {
      const response = await api.post('/users/sync-secondary-phone/verify', {
        phoneNumber: formData.secondaryPhone,
        otp: secondaryOtp,
      });
      setUser({ ...user, ...response.data.user });
      setSecondaryOtpStep(false);
      setSecondaryOtp('');
      setSuccess('Secondary phone verified and synced!');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP.');
    } finally {
      setSecondarySyncing(false);
    }
  };

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

  const getInitial = () => {
    return user?.name ? user.name.charAt(0).toUpperCase() : '?';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">My Profile</h1>
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
        
        {success && (
          <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-md">{success}</div>
        )}

        {/* Profile Image Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Profile Picture</h2>
          <div className="flex items-center gap-6">
            {/* Current Image or Initial */}
            <div className="relative">
              {user?.profileImage ? (
                <img
                  src={user.profileImage?.replace('http://', 'https://')}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-4 border-indigo-100"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-indigo-600 flex items-center justify-center text-white text-3xl font-bold border-4 border-indigo-100">
                  {getInitial()}
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                  <div className="text-white text-sm">Uploading...</div>
                </div>
              )}
            </div>

            {/* Upload Button */}
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Change Photo'}
              </button>
              <p className="text-sm text-gray-500 mt-2">
                JPG, PNG, GIF up to 5MB
              </p>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Profile Information</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Enter phone number"
              />
            </div>

            {/* Secondary Phone */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secondary Phone Number
                <span className="ml-2 text-xs text-gray-400 font-normal">(optional — invites sent to this number will also reach you)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={formData.secondaryPhone}
                  onChange={(e) => setFormData({ ...formData, secondaryPhone: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g. +1234567890"
                  disabled={user?.isSecondaryPhoneVerified}
                />
                {!user?.isSecondaryPhoneVerified && !secondaryOtpStep && (
                  <button
                    type="button"
                    onClick={handleRequestSecondarySync}
                    disabled={secondarySyncing}
                    className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {secondarySyncing ? 'Sending...' : 'Verify'}
                  </button>
                )}
                {user?.isSecondaryPhoneVerified && (
                  <span className="px-3 py-2 bg-green-100 text-green-700 text-sm rounded-md font-medium">✓ Verified</span>
                )}
              </div>

              {secondaryOtpStep && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={secondaryOtp}
                    onChange={(e) => setSecondaryOtp(e.target.value)}
                    className="flex-1 px-3 py-2 border border-indigo-300 rounded-md"
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={handleVerifySecondarySync}
                    disabled={secondarySyncing || secondaryOtp.length !== 6}
                    className="px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {secondarySyncing ? 'Verifying...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSecondaryOtpStep(false); setSecondaryOtp(''); }}
                    className="px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {user?.secondaryPhone && !user?.isSecondaryPhoneVerified && !secondaryOtpStep && (
                <p className="text-xs text-amber-600 mt-1">Number saved but not yet verified. Enter the number and click Verify.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-lg shadow-md p-6 border-2 border-red-200">
          <h2 className="text-xl font-semibold mb-2 text-red-700">Danger Zone</h2>
          <p className="text-sm text-gray-600 mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <button
            onClick={handleDeleteAccount}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
