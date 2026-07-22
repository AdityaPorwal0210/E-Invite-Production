import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

/**
 * Shown on a guest's own invitation view. Renders only when the host has
 * requested this guest's ID. Requires explicit consent before uploading, and
 * stores the ID privately (viewable only via short-lived signed links).
 */
const GuestIdUpload = ({ invitationId }) => {
  const [state, setState] = useState(null); // { requested, note, consent, documents }
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/invitations/${invitationId}/my-id-request`);
        if (active) {
          setState(res.data);
          setConsent(res.data.consent || false);
        }
      } catch {
        // Not on this guest list / not applicable — render nothing
        if (active) setState({ requested: false });
      }
    })();
    return () => { active = false; };
  }, [invitationId]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!consent) {
      toast.error('Please tick the consent box before uploading');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const formData = new FormData();
    files.slice(0, 3).forEach((f) => formData.append('documents', f));
    formData.append('consent', 'true');

    setUploading(true);
    try {
      const res = await api.post(`/invitations/${invitationId}/id-documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('ID uploaded securely');
      setState((s) => ({ ...s, documents: res.data.documents || [], consent: true }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeDoc = async (docId) => {
    try {
      // Guests delete their own docs using their own user id as guestId — the
      // backend authorises the owner. We fetch it from the token server-side,
      // so we pass 'me' via the owner path using the current user's id.
      await api.delete(`/invitations/${invitationId}/guests/${state.myId}/id-documents/${docId}`);
      setState((s) => ({ ...s, documents: s.documents.filter((d) => d._id !== docId) }));
      toast.success('Removed');
    } catch {
      toast.error('Could not remove');
    }
  };

  if (!state || !state.requested) return null;

  const docs = state.documents || [];

  // Once submitted, collapse to a small confirmation
  if (docs.length > 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-center gap-2">
        <span className="text-green-600">✓</span>
        <span className="text-sm font-medium text-green-800">ID submitted</span>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-6">
      <div className="flex items-start gap-2">
        <span className="text-xl">🪪</span>
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900">The host has requested your ID</h3>
          <p className="text-sm text-amber-800 mt-1">
            {state.note || 'This is used for your hotel booking. Your ID is stored securely and only the host can view it.'}
          </p>

          {(
            <div className="mt-3">
              <label className="flex items-start gap-2 text-sm text-amber-900 mb-3">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>I agree to share a photo of my ID with the host for this event's arrangements.</span>
              </label>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleUpload}
                disabled={!consent || uploading}
                className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-indigo-600 file:text-white file:font-medium hover:file:bg-indigo-700 disabled:opacity-50"
              />
              {uploading && <p className="text-sm text-amber-800 mt-2">Uploading securely…</p>}
              <p className="text-xs text-amber-700 mt-2">You can upload up to 3 photos (e.g. front and back).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GuestIdUpload;
