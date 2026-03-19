import { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ReactPlayer from 'react-player';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

const InvitationDetail = () => {
  // ============ HOOKS FIRST ============
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, fetchNotificationCounts } = useContext(AuthContext);

  // State
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myRsvp, setMyRsvp] = useState(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [userSalutations, setUserSalutations] = useState({});
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    eventDate: '',
    location: '',
    videoUrl: '',
    googleMapsLink: ''
  });

  // Refs
  const searchTimeoutRef = useRef(null);
  const sliderRef = useRef(null);

  // ============ DERIVED VARIABLES BEFORE USE EFFECT ============
  const getStringId = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value._id) return value._id.toString();
    return value.toString();
  };

  const currentUserId = user ? getStringId(user?._id) || getStringId(user?.id) : null;
  const hostId = invitation ? (getStringId(invitation?.host?._id) || getStringId(invitation?.host) || getStringId(invitation?.user)) : null;
  const isOwner = Boolean(currentUserId && hostId && currentUserId === hostId);
  const guestList = invitation?.guestList || [];
  const pendingGuests = invitation?.pendingGuestEmails || [];

  // ============ USE EFFECT BLOCKS AFTER DERIVED VARIABLES ============
  useEffect(() => {
    if (!authLoading) {
      fetchInvitation();
    }
  }, [id, authLoading, user]);

  useEffect(() => {
    if (showInviteModal) {
      fetchGroups();
    }
  }, [showInviteModal]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!showInviteModal || userSearch.trim().length < 2) {
      setUserResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(userSearch);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [userSearch, showInviteModal]);

  // Auto-mark as read when opening
  useEffect(() => {
    if (user && invitation && !isOwner && !invitation.isRead) {
      api.put(`/invitations/${id}/read`)
        .then(() => {
          setInvitation(prev => ({ ...prev, isRead: true }));
          fetchNotificationCounts();
        })
        .catch(err => console.error('Failed to mark as read:', err));
    }
  }, [invitation?.isRead, isOwner, user, id]);

  // ============ ALL FUNCTIONS AFTER USE EFFECT ============
  const fetchInvitation = async () => {
    try {
      const endpoint = user ? `/invitations/${id}` : `/invitations/${id}/teaser`;
      const response = await api.get(endpoint);
      setInvitation(response.data);
      if (response.data.myRsvp) setMyRsvp(response.data.myRsvp);
      if (response.data.isSaved !== undefined) setIsSaved(response.data.isSaved);
      setLoading(false);
    } catch (err) {
      if (user) {
        try {
          const receivedRes = await api.get('/invitations/received');
          const found = receivedRes.data.invitations?.find(inv => inv._id === id);
          if (found) {
            setInvitation(found);
          } else {
            setError('Event not found or access denied.');
          }
        } catch (e) {
          setError('Event not found or access denied.');
        }
      } else {
        setError('Event not found.');
      }
      setLoading(false);
    }
  };

  const handleRSVP = async (status) => {
    setRsvpLoading(true);
    try {
      const response = await api.put(`/invitations/${id}/rsvp`, { status });
      setMyRsvp(response.data.rsvpStatus);
      toast.success('RSVP updated successfully!');
      await fetchInvitation();
      fetchNotificationCounts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update RSVP');
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleToggleSave = async () => {
    setSaveLoading(true);
    try {
      const response = await api.put(`/invitations/${id}/save`);
      setIsSaved(response.data.isSaved);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRevoke = async (type, value) => {
    if (!window.confirm('Are you sure you want to remove this guest/group?')) return;
    try {
      let payload = {};
      if (type === 'userId') payload.userId = value;
      if (type === 'email') payload.email = value;
      if (type === 'groupId') payload.groupId = value;
      await api.put(`/invitations/${id}/revoke`, payload);
      fetchInvitation();
    } catch (err) {
      alert('Failed to remove guest.');
    }
  };

  const fetchGroups = async () => {
    setGroupsLoading(true);
    try {
      const response = await api.get('/groups');
      const alreadyShared = invitation?.sharedGroups?.map(g => g._id || g) || [];
      const processed = (response.data || []).map(g => ({
        ...g,
        isAlreadyShared: alreadyShared.includes(g._id)
      }));
      setGroups(processed);
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    } finally {
      setGroupsLoading(false);
    }
  };

  const searchUsers = async (query) => {
    setSearchingUsers(true);
    try {
      const response = await api.get(`/users/search?query=${encodeURIComponent(query)}`);
      const guestListIds = guestList.map(g => getStringId(g.recipient?._id));
      const invitedUserIds = invitation?.invitedUsers?.map(u => getStringId(u._id)) || [];
      const hostUserId = getStringId(invitation?.host?._id);

      const processed = response.data.map(u => {
        const userId = getStringId(u._id);
        return {
          ...u,
          isAlreadyInvited: guestListIds.includes(userId) || invitedUserIds.includes(userId),
          isHost: userId === hostUserId
        };
      });

      setUserResults(processed.filter(u => !u.isHost));
    } catch (err) {
      console.error('Failed to search users:', err);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleGroupToggle = (groupId) => {
    setSelectedGroups(prev =>
      prev.includes(groupId) ? prev.filter(gid => gid !== groupId) : [...prev, groupId]
    );
  };

  const addUser = (user) => {
    // Store user with a default empty salutation
    setSelectedUsers(prev => [...prev, { ...user, salutation: '' }]);
    setUserSearch('');
    setUserResults([]);
  };

  const removeUser = (userId) => {
    setSelectedUsers(prev => prev.filter(u => u._id !== userId));
  };

  const updateUserSalutation = (userId, salutation) => {
    setSelectedUsers(prev => prev.map(u => u._id === userId ? { ...u, salutation } : u));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const email = userSearch.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(email) && !selectedUsers.some(u => u._id === email)) {
        addUser({ _id: email, name: email, email });
      }
    }
  };

  const handleInvite = async () => {
    let finalUsers = [...selectedUsers];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(userSearch.trim()) && !finalUsers.some(u => u._id === userSearch.trim())) {
      finalUsers.push({ _id: userSearch.trim(), name: userSearch.trim(), email: userSearch.trim() });
    }
    if (selectedGroups.length === 0 && finalUsers.length === 0) return;

    setInviting(true);
    try {
      // Build salutations map from selectedUsers (user-level salutations)
      const salutationsMap = {};
      finalUsers.forEach(u => {
        if (u.salutation) {
          salutationsMap[u._id] = u.salutation;
        }
      });

      const payload = {
        newGroups: selectedGroups,
        newUsers: finalUsers.map(u => u._id),
        salutations: salutationsMap
      };
      const response = await api.post(`/invitations/${id}/share`, payload);
      toast.success('Invitation sent successfully!');
      setInviteSuccess(response.data.message);
      setInvitation(response.data.invitation);
      setTimeout(() => {
        setShowInviteModal(false);
        setSelectedGroups([]);
        setSelectedUsers([]);
        setUserSalutations({});
        setUserSearch('');
        setInviteSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send invitations');
    } finally {
      setInviting(false);
    }
  };

  const formatVideoUrl = (url) => {
    if (!url) return null;
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) return `https://${cleanUrl}`;
    return cleanUrl;
  };

  const getYouTubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const handleScroll = () => {
    if (sliderRef.current) {
      setCurrentSlide(Math.round(sliderRef.current.scrollLeft / sliderRef.current.clientWidth));
    }
  };

  const scrollSlider = (direction) => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({
        left: direction === 'right' ? sliderRef.current.clientWidth : -sliderRef.current.clientWidth,
        behavior: 'smooth'
      });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this event?')) return;
    setIsDeleting(true);
    try {
      await api.delete(`/invitations/${id}`);
      navigate('/');
    } catch (err) {
      alert('Failed to delete event');
      setIsDeleting(false);
    }
  };

  const openEditModal = () => {
    setEditForm({
      title: invitation.title || '',
      description: invitation.description || '',
      eventDate: invitation.eventDate ? invitation.eventDate.split('T')[0] : '',
      location: invitation.location || '',
      videoUrl: invitation.videoUrl || '',
      googleMapsLink: invitation.googleMapsLink || ''
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const response = await api.put(`/invitations/${id}`, editForm);
      setInvitation(response.data);
      setShowEditModal(false);
    } catch (err) {
      alert('Failed to update event');
    } finally {
      setUpdating(false);
    }
  };

  const getRsvpStatusColor = (status) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-700';
      case 'declined': return 'bg-red-100 text-red-700';
      case 'tentative': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatRsvpStatus = (status) => {
    switch (status) {
      case 'accepted': return 'Going';
      case 'declined': return "Can't Go";
      case 'tentative': return 'Maybe';
      default: return status;
    }
  };

  // ============ EARLY RETURNS ============
  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">{error || 'Event Not Found'}</h1>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          {invitation.coverImage ? (
            <img src={invitation.coverImage} alt="Event Cover" className="w-full h-64 object-cover" />
          ) : (
            <div className="w-full h-64 bg-gray-200 flex items-center justify-center text-5xl">📅</div>
          )}
          <div className="p-8 text-center">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">{invitation.title}</h1>
            <p className="text-lg text-gray-500 mb-8">Hosted by <span className="font-semibold text-gray-900">{invitation.host?.name || 'Unknown'}</span></p>
            <button onClick={() => navigate(`/register?returnTo=${location.pathname}`)} className="w-full py-3 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 mb-2">
              Create Account to RSVP & View Details
            </button>
            <button onClick={() => navigate(`/login?returnTo=${location.pathname}`)} className="w-full py-3 px-4 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50">
              Already registered? Log in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ RENDER ============
  const attachments = invitation?.attachments || [];
  const imageFiles = [
    ...(invitation?.coverImage ? [invitation.coverImage] : []),
    ...attachments.filter(a => a.fileType?.includes('image')).map(a => a.url)
  ];
  const pdfFiles = attachments.filter(a => a.fileType?.includes('pdf'));

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="mb-6 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">← Back</button>

        {imageFiles.length > 0 ? (
          <div className="relative group mb-6">
            <div ref={sliderRef} onScroll={handleScroll} className="w-full h-64 md:h-96 flex overflow-x-auto snap-x snap-mandatory rounded-lg scrollbar-hide">
              {imageFiles.map((imgUrl, index) => (
                <div key={index} className="min-w-full h-full snap-center">
                  <img src={imgUrl} alt={`Slide ${index + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            {imageFiles.length > 1 && (
              <>
                <button onClick={() => scrollSlider('left')} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 z-10">←</button>
                <button onClick={() => scrollSlider('right')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 z-10">→</button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full z-10">{currentSlide + 1} / {imageFiles.length}</div>
              </>
            )}
          </div>
        ) : (
          <div className="h-64 md:h-96 w-full rounded-lg bg-gray-300 flex items-center justify-center mb-6">
            <span className="text-6xl">📅</span>
          </div>
        )}

        <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}`}</style>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-3xl font-bold text-gray-900">{invitation.title}</h1>
            {isOwner && (
              <div className="flex gap-2">
                <button onClick={openEditModal} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Edit</button>
                <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm disabled:opacity-50">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                <button onClick={() => setShowInviteModal(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm">+ Invite More</button>
                <button onClick={() => navigate(`/invitation/${id}/guests`)} className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 text-sm">📊 Guest List</button>
                <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">Your Event</span>
              </div>
            )}
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex items-center text-gray-600"><span className="text-xl mr-3">📅</span><span className="font-medium">{formatDate(invitation.eventDate)}</span></div>
            <div className="flex items-center text-gray-600">
              <span className="text-xl mr-3">📍</span><span className="font-medium">{invitation.location}</span>
              {invitation.googleMapsLink && <a href={invitation.googleMapsLink} target="_blank" rel="noopener noreferrer" className="ml-2 text-sm text-blue-600 hover:underline">View on Maps</a>}
            </div>
            {invitation.videoUrl && (
              <div className="mb-6 rounded-lg overflow-hidden relative pt-[56.25%] bg-black">
                {getYouTubeId(invitation.videoUrl) ? (
                  <iframe className="absolute top-0 left-0 w-full h-full" src={`https://www.youtube.com/embed/${getYouTubeId(invitation.videoUrl)}`} title="YouTube" frameBorder="0" allowFullScreen />
                ) : (
                  <video className="absolute top-0 left-0 w-full h-full" src={formatVideoUrl(invitation.videoUrl)} controls />
                )}
              </div>
            )}
            {pdfFiles.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-3">Documents</h3>
                {pdfFiles.map((pdf, index) => (
                  <a key={index} href={pdf.url} target="_blank" rel="noopener noreferrer" className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 mb-2">
                    <span className="text-red-500 text-2xl mr-3">📄</span>
                    <span className="text-sm text-gray-700 flex-1">{pdf.name || `PDF ${index + 1}`}</span>
                    <span className="text-sm text-blue-600">View →</span>
                  </a>
                ))}
              </div>
            )}
            <div className="flex items-center text-gray-600"><span className="text-xl mr-3">👤</span><span className="font-medium">Hosted by {invitation.host?.name || 'Unknown'}</span></div>
          </div>

          {!isOwner && (
            <div className="mb-8 border-t pt-6">
              {invitation.mySalutation && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-amber-800 font-medium italic">Cordially inviting: {invitation.mySalutation}{user?.name ? ` ${user.name}` : ''}</p>
                </div>
              )}
              <h3 className="font-semibold text-gray-700 mb-4">Will you attend?</h3>
              <div className="flex gap-3">
                <button onClick={() => handleRSVP('accepted')} disabled={rsvpLoading} className={`px-4 py-2 rounded-md font-medium ${myRsvp === 'accepted' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>✓ Going</button>
                <button onClick={() => handleRSVP('tentative')} disabled={rsvpLoading} className={`px-4 py-2 rounded-md font-medium ${myRsvp === 'tentative' || !myRsvp ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>? Maybe</button>
                <button onClick={() => handleRSVP('declined')} disabled={rsvpLoading} className={`px-4 py-2 rounded-md font-medium ${myRsvp === 'declined' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>✕ Can't Go</button>
              </div>
              {myRsvp && <p className="mt-2 text-sm text-gray-500">Your response: <span className="font-medium">{formatRsvpStatus(myRsvp)}</span></p>}
              <button onClick={handleToggleSave} disabled={saveLoading} className={`mt-4 px-4 py-2 rounded-md font-medium ${isSaved ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}>
                {isSaved ? '★ Saved' : '☆ Save the Date'}
              </button>
            </div>
          )}

          {isOwner && (guestList.length > 0 || pendingGuests.length > 0) && (
            <div className="mb-8 border-t pt-6">
              <h3 className="font-semibold text-gray-700 mb-4">Guest List ({guestList.length + pendingGuests.length})</h3>
              {guestList.map((guest) => (
                <div key={guest._id || guest.recipient?._id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{guest.recipient?.name || 'Unknown'}</p>
                    <p className="text-sm text-gray-500">{guest.recipient?.email || ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRsvpStatusColor(guest.rsvpStatus)}`}>{formatRsvpStatus(guest.rsvpStatus) || 'Pending'}</span>
                    <button onClick={() => handleRevoke('userId', guest.recipient?._id)} className="text-red-500 hover:text-red-700 px-2 py-1 rounded">✕</button>
                  </div>
                </div>
              ))}
              {pendingGuests.map((email) => (
                <div key={email} className="flex justify-between items-center p-3 bg-gray-50 rounded-md mb-2 border border-dashed border-gray-300">
                  <div>
                    <p className="font-medium text-gray-900 italic">Unregistered Guest</p>
                    <p className="text-sm text-gray-500">{email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Invite Sent</span>
                    <button onClick={() => handleRevoke('email', email)} className="text-red-500 hover:text-red-700 px-2 py-1 rounded">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {invitation.sharedGroups && invitation.sharedGroups.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-700 mb-2">Shared with groups:</h3>
              <div className="flex flex-wrap gap-2">
                {invitation.sharedGroups.map((group) => (
                  <span key={group._id || group} className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full flex items-center gap-2">
                    {group.name || group}
                    {isOwner && <button onClick={() => handleRevoke('groupId', group._id)} className="text-purple-400 hover:text-purple-900">✕</button>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {invitation.description && (
            <div className="border-t pt-6">
              <h3 className="font-semibold text-gray-700 mb-2">About this event</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{invitation.description}</p>
            </div>
          )}
        </div>
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Invite More People</h2>
                <button onClick={() => { setShowInviteModal(false); setSelectedGroups([]); setSelectedUsers([]); setInviteSuccess(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              {inviteSuccess && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md">{inviteSuccess}</div>}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Add Groups</label>
                {groupsLoading ? <p className="text-sm text-gray-500">Loading...</p> : groups.length === 0 ? <p className="text-sm text-gray-500">No groups available</p> : (
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2">
                    {groups.map((group) => (
                      <label key={group._id} className={`flex items-center space-x-2 ${group.isAlreadyShared ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" checked={selectedGroups.includes(group._id)} onChange={() => !group.isAlreadyShared && handleGroupToggle(group._id)} disabled={group.isAlreadyShared} className="h-4 w-4 text-indigo-600" />
                        <span className="text-sm">{group.name}</span>
                        {group.isAlreadyShared && <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">Already Shared</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Invite Individuals</label>
                <div className="relative">
                  <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} onKeyDown={handleKeyDown} placeholder="Search or type email + Enter" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  {userResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {userResults.map((u) => (
                        <button key={u._id} onClick={() => !u.isAlreadyInvited && addUser(u)} disabled={u.isAlreadyInvited} className={`w-full text-left px-3 py-2 ${u.isAlreadyInvited ? 'bg-gray-50 opacity-50' : 'hover:bg-indigo-50'}`}>
                          <p className="text-sm font-medium">{u.name}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedUsers.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {selectedUsers.map((u) => (
                      <div key={u._id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md gap-2">
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-sm font-medium truncate">{u.name}</span>
                          <span className="text-xs text-gray-500 truncate">{u.email}</span>
                        </div>
                        <select
                          value={u.salutation || ''}
                          onChange={(e) => updateUserSalutation(u._id, e.target.value)}
                          className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white flex-shrink-0"
                        >
                          <option value="">None</option>
                          <option value="Mr.">Mr.</option>
                          <option value="Mrs.">Mrs.</option>
                          <option value="Ms.">Ms.</option>
                          <option value="Mr. & Mrs.">Mr. & Mrs.</option>
                          <option value="With Family">With Family</option>
                        </select>
                        <button onClick={() => removeUser(u._id)} className="text-red-500 hover:text-red-700 flex-shrink-0">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleInvite} disabled={inviting || (selectedGroups.length === 0 && selectedUsers.length === 0)} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                  {inviting ? 'Sending...' : 'Send Invitations'}
                </button>
                <button onClick={() => { setShowInviteModal(false); setSelectedGroups([]); setSelectedUsers([]); }} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Edit Event</h2>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="space-y-4">
                {['title', 'description', 'eventDate', 'location', 'videoUrl', 'googleMapsLink'].map((field) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                    {field === 'description' ? (
                      <textarea value={editForm[field]} onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    ) : (
                      <input type={field === 'eventDate' ? 'date' : field.includes('Url') ? 'url' : 'text'} value={editForm[field]} onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={handleUpdate} disabled={updating} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{updating ? 'Saving...' : 'Save Changes'}</button>
                <button onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvitationDetail;
