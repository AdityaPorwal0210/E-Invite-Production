import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { invalidateCache } from '../utils/useCachedGet';

const CreateEventForm = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [googleMapsLink, setGoogleMapsLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState([]);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim() || !location.trim() || !eventDate) {
      setError('Please fill in all required fields.');
      return;
    }

    const urlPattern = new RegExp('^(https?:\\/\\/)?'+ '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ '((\\d{1,3}\\.){3}\\d{1,3}))'+ '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ '(\\?[;&a-z\\d%_.~+=-]*)?'+ '(\\#[-a-z\\d_]*)?$','i');
    
    if (videoUrl && !urlPattern.test(videoUrl)) {
      setError('The video URL is malformed. Please provide a valid link.');
      return;
    }

    if (googleMapsLink && !urlPattern.test(googleMapsLink)) {
      setError('The Google Maps Link is malformed. Please provide a valid link.');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    
    // CRITICAL FIX: Convert local browser time to standard UTC ISO string
    const isoDate = new Date(eventDate).toISOString();
    formData.append('eventDate', isoDate);
    
    formData.append('location', location.trim());

    if (videoUrl.trim()) {
      formData.append('videoUrl', videoUrl.trim());
    }

    if (googleMapsLink.trim()) {
      formData.append('googleMapsLink', googleMapsLink.trim());
    }

    if (attachments.length > 0) {
      attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }

    try {
      const response = await api.post('/invitations/create', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.status === 201) {
        invalidateCache('dashboard-invitations'); // new event should show on next dashboard visit
        navigate(`/invitation/${response.data._id}`);
      }
    } catch (err) {
      console.error("Submission Error:", err);
      setError(err.response?.data?.message || 'Failed to create event. Check your connection.');
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);

    if (files.length > 5) {
      alert('Maximum 5 attachments allowed');
      e.target.value = '';
      return;
    }

    if (attachments.length + files.length > 5) {
      alert('Maximum 5 attachments allowed. Please remove some files first.');
      e.target.value = '';
      return;
    }

    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Prevent users from picking dates in the past
  const getTodayString = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
    return localISOTime;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create New Event
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Fill in the details to create your event
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4 border border-red-200">
              <p className="text-sm text-red-800 font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Event Title *
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Enter event title"
              />
            </div>

            <div>
              <label htmlFor="eventDate" className="block text-sm font-medium text-gray-700 mb-1">
                Event Date & Time *
              </label>
              {/* CRITICAL FIX: Changed from "date" to "datetime-local" */}
              <input
                id="eventDate"
                name="eventDate"
                type="datetime-local"
                required
                min={getTodayString()}
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Location *
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Enter event location"
              />
            </div>

            <div>
              <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-700 mb-1">
                Video URL (Optional)
              </label>
              <input
                id="videoUrl"
                name="videoUrl"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="https://youtube.com/..."
              />
            </div>

            <div>
              <label htmlFor="googleMapsLink" className="block text-sm font-medium text-gray-700 mb-1">
                Google Maps Link (Optional)
              </label>
              <input
                id="googleMapsLink"
                name="googleMapsLink"
                type="url"
                value={googleMapsLink}
                onChange={(e) => setGoogleMapsLink(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="https://maps.google.com/..."
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows="4"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Enter event description"
              />
            </div>

            <div>
              <label htmlFor="attachments" className="block text-sm font-medium text-gray-700 mb-1">
                Attachments / Cover Image (Max 5 files)
              </label>
              <input
                id="attachments"
                name="attachments"
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
              />
              {attachments.length > 0 && (
                <div className="mt-3 p-3 bg-white border border-gray-200 rounded-md">
                  <p className="text-sm font-medium text-gray-700 border-b pb-2 mb-2">Selected files ({attachments.length}/5):</p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    {attachments.map((file, index) => (
                      <li key={index} className="flex items-center justify-between">
                        <span className="truncate pr-4">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="text-red-500 hover:text-red-700 font-bold px-2 py-1 bg-red-50 rounded"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating Event...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEventForm;