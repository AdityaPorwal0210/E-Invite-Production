import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';

const HostGuestList = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [removingGuest, setRemovingGuest] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchGuestList();
  }, [id]);

  const fetchGuestList = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/invitations/${id}/guests`);
      setGuests(response.data.guests || []);
      setError('');
    } catch (err) {
      console.error('Error fetching guest list:', err);
      setError(err.response?.data?.message || 'Failed to load guest list');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveGuest = async (guestId, guestName) => {
    if (!window.confirm(`Are you sure you want to remove ${guestName || 'this guest'}?`)) {
      return;
    }

    try {
      setRemovingGuest(guestId);
      await api.delete(`/invitations/${id}/guests/${guestId}`);
      
      // Remove from local state
      setGuests(guests.filter(g => g.recipient?._id !== guestId));
    } catch (err) {
      console.error('Error removing guest:', err);
      alert(err.response?.data?.message || 'Failed to remove guest');
    } finally {
      setRemovingGuest(null);
    }
  };

  // Get status display info
  const getStatusInfo = (status) => {
    const statusMap = {
      'accepted': { label: 'Going', color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
      'declined': { label: "Can't Go", color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
      'tentative': { label: 'Maybe', color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
      'Pending': { label: 'Pending', color: 'bg-gray-100 text-gray-800', dot: 'bg-gray-500' }
    };
    return statusMap[status] || { label: status || 'Unknown', color: 'bg-gray-100 text-gray-800', dot: 'bg-gray-500' };
  };

  // Combined filter: search + RSVP status
  const filteredGuests = guests.filter(guest => {
    // First filter by RSVP status
    if (filter !== 'All') {
      const status = guest.rsvpStatus;
      if (filter === 'Going' && status !== 'accepted') return false;
      if (filter === 'Maybe' && status !== 'tentative') return false;
      if (filter === "Can't Go" && status !== 'declined') return false;
      if (filter === 'Pending' && (status && status !== 'Pending')) return false;
    }
    
    // Then filter by search query (name or contact)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const guestName = (guest.recipient?.name || '').toLowerCase();
      const guestEmail = (guest.recipient?.email || '').toLowerCase();
      const guestPhone = (guest.recipient?.phone || '').toLowerCase();
      
      // Check if query matches name, email, or phone
      if (!guestName.includes(query) && !guestEmail.includes(query) && !guestPhone.includes(query)) {
        return false;
      }
    }
    
    return true;
  });

  // Count guests by status
  const statusCounts = {
    All: guests.length,
    Going: guests.filter(g => g.rsvpStatus === 'accepted').length,
    Maybe: guests.filter(g => g.rsvpStatus === 'tentative').length,
    "Can't Go": guests.filter(g => g.rsvpStatus === 'declined').length,
    Pending: guests.filter(g => !g.rsvpStatus || g.rsvpStatus === 'Pending').length
  };

  // CSV Export function
  const exportToCSV = () => {
    // Create CSV headers
    const headers = ['Name', 'Contact', 'Status'];
    
    // Map filtered guests to CSV rows
    const rows = filteredGuests.map(guest => {
      const guestName = guest.recipient?.name || 'Unknown Guest';
      const guestEmail = guest.recipient?.email || '';
      const guestPhone = guest.recipient?.phone || '';
      const contact = guestPhone ? `${guestEmail} / ${guestPhone}` : guestEmail;
      const status = getStatusInfo(guest.rsvpStatus).label;
      
      // Escape quotes and wrap in quotes
      const escapeCSV = (str) => `"${String(str).replace(/"/g, '""')}"`;
      
      return [escapeCSV(guestName), escapeCSV(contact), escapeCSV(status)].join(',');
    });
    
    // Combine into CSV string
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `guest-list-${id}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading guest list...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Guest List Management</h1>
          <button
            onClick={() => navigate(`/invitation/${id}`, { replace: true })}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Back to Event
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {/* Search and Filter Row */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search Input */}
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by name or contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              {['All', 'Going', 'Maybe', "Can't Go", 'Pending'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    filter === status
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status}
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    filter === status ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {statusCounts[status]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Table Header with Export Button */}
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Guests</h2>
            <button
              onClick={exportToCSV}
              disabled={filteredGuests.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export to CSV
            </button>
          </div>
          
          {filteredGuests.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              {searchQuery || filter !== 'All' 
                ? 'No guests match your search or filter criteria.' 
                : 'No guests have been invited yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      RSVP Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredGuests.map((guest, index) => {
                    const statusInfo = getStatusInfo(guest.rsvpStatus);
                    const guestName = guest.recipient?.name || 'Unknown Guest';
                    const guestEmail = guest.recipient?.email || '';
                    const guestPhone = guest.recipient?.phone || '';
                    const guestImage = guest.recipient?.profileImage;
                    const guestSalutation = guest.salutation || '';
                    
                    // Format contact: show email, phone, or both
                    const contactDisplay = guestPhone 
                      ? (guestEmail ? `${guestEmail} / ${guestPhone}` : guestPhone)
                      : guestEmail;
                    
                    return (
                      <tr key={guest._id || index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {guestImage ? (
                              <img
                                src={guestImage?.replace('http://', 'https://')}
                                alt={guestName}
                                className="h-10 w-10 rounded-full object-cover mr-3"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold mr-3">
                                {guestName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <span className="text-sm font-medium text-gray-900">{guestName}</span>
                              {guestSalutation && (
                                <span className="ml-2 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                                  {guestSalutation}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">{contactDisplay || 'No contact'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                            <span className={`w-2 h-2 rounded-full mr-2 ${statusInfo.dot}`}></span>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleRemoveGuest(guest.recipient?._id, guestName)}
                            disabled={removingGuest === guest.recipient?._id}
                            className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                          >
                            {removingGuest === guest.recipient?._id ? 'Removing...' : '✕'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Showing {filteredGuests.length} of {guests.length} guests
        </div>
      </div>
    </div>
  );
};

export default HostGuestList;
