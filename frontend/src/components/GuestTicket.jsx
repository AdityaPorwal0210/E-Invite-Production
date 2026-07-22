import { useState, useEffect } from 'react';
import api from '../utils/api';

/**
 * The guest's QR ticket for an event — shown on their own invitation view.
 * They present this at the gate; the host scans it to check them in.
 * Renders nothing if the guest isn't on the list.
 */
const GuestTicket = ({ invitationId }) => {
  const [ticket, setTicket] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/invitations/${invitationId}/my-ticket`);
        if (active) setTicket(res.data);
      } catch {
        if (active) setTicket(null);
      }
    })();
    return () => { active = false; };
  }, [invitationId]);

  if (!ticket) return null;

  // Once checked in, collapse to a small confirmation
  if (ticket.checkedIn) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-center gap-2">
        <span className="text-green-700 font-medium">✓ Checked in</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6 text-center">
      <h3 className="font-semibold text-gray-900">Your entry pass</h3>
      <p className="text-sm text-gray-600 mt-1">Show this QR at the gate for check-in.</p>

      <img
        src={ticket.qr}
        alt="Your entry QR code"
        className={`mx-auto mt-4 rounded-lg cursor-pointer transition-all ${open ? 'w-64 h-64' : 'w-40 h-40'}`}
        onClick={() => setOpen((o) => !o)}
      />
      <p className="text-xs text-gray-500 mt-2">Tap the code to enlarge</p>

      {ticket.name && <p className="text-sm font-medium text-gray-800 mt-3">{ticket.name}</p>}
    </div>
  );
};

export default GuestTicket;
