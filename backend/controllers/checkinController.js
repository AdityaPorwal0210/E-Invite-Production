const crypto = require('crypto');
const QRCode = require('qrcode');
const Invitation = require('../models/Invitation');
const ReceivedInvitation = require('../models/ReceivedInvitation');

// Authorise the requester as host or delegate of the event
const loadHostContext = async (invitationId, userId) => {
  const invitation = await Invitation.findById(invitationId);
  if (!invitation) return { error: { status: 404, message: 'Event not found' } };
  const isHost = invitation.user.toString() === userId;
  const isDelegate = invitation.delegates && invitation.delegates.some(d => d.toString() === userId);
  if (!isHost && !isDelegate) return { error: { status: 403, message: 'Not authorized for this event' } };
  return { invitation };
};

const genTicketId = () => crypto.randomBytes(12).toString('hex'); // 24-char unguessable token

// @route GET /api/invitations/:id/my-ticket
// @desc  Guest's own QR ticket. Generates a ticketId on first request.
const getMyTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const received = await ReceivedInvitation.findOne({ invitation: id, recipient: req.user.id })
      .populate('recipient', 'name');
    if (!received) return res.status(404).json({ message: 'You are not on this guest list' });

    if (!received.ticketId) {
      received.ticketId = genTicketId();
      await received.save();
    }

    // Encode just the token; the host scanner posts it back to /checkin.
    const qrDataUrl = await QRCode.toDataURL(received.ticketId, { margin: 1, width: 400 });

    res.status(200).json({
      ticketId: received.ticketId,
      qr: qrDataUrl,
      name: received.recipient?.name || '',
      checkedIn: received.checkedIn || false,
      checkedInAt: received.checkedInAt || null,
    });
  } catch (err) {
    console.error('Get Ticket Error:', err);
    res.status(500).json({ message: 'Error generating ticket' });
  }
};

// @route POST /api/invitations/:id/checkin
// @desc  Host scans/searches a ticket and marks the guest arrived.
// @body  { ticketId }  OR  { guestId }  (manual check-in by recipient id)
const checkIn = async (req, res) => {
  try {
    const { id } = req.params;
    const { ticketId, guestId } = req.body;
    const { error } = await loadHostContext(id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const query = { invitation: id };
    if (ticketId) query.ticketId = ticketId;
    else if (guestId) query.recipient = guestId;
    else return res.status(400).json({ message: 'A ticket or guest is required' });

    const received = await ReceivedInvitation.findOne(query).populate('recipient', 'name email');
    if (!received) {
      return res.status(404).json({ message: 'Ticket not recognised for this event', status: 'invalid' });
    }

    const guestName = received.recipient?.name || 'Guest';

    if (received.checkedIn) {
      return res.status(200).json({
        status: 'already',
        message: `${guestName} already checked in`,
        name: guestName,
        checkedInAt: received.checkedInAt,
      });
    }

    received.checkedIn = true;
    received.checkedInAt = new Date();
    await received.save();

    // Live arrived count for the scanner UI
    const arrivedCount = await ReceivedInvitation.countDocuments({ invitation: id, checkedIn: true });
    const invitedCount = await ReceivedInvitation.countDocuments({ invitation: id });

    res.status(200).json({
      status: 'ok',
      message: `${guestName} checked in`,
      name: guestName,
      rsvpStatus: received.rsvpStatus,
      arrivedCount,
      invitedCount,
    });
  } catch (err) {
    console.error('Check-in Error:', err);
    res.status(500).json({ message: 'Error during check-in' });
  }
};

// @route POST /api/invitations/:id/checkin/undo
// @desc  Host reverses a check-in (mis-scan)
const undoCheckIn = async (req, res) => {
  try {
    const { id } = req.params;
    const { guestId, ticketId } = req.body;
    const { error } = await loadHostContext(id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const query = { invitation: id };
    if (ticketId) query.ticketId = ticketId;
    else if (guestId) query.recipient = guestId;
    else return res.status(400).json({ message: 'A ticket or guest is required' });

    const received = await ReceivedInvitation.findOneAndUpdate(
      query,
      { $set: { checkedIn: false, checkedInAt: null } },
      { new: true }
    );
    if (!received) return res.status(404).json({ message: 'Guest not found' });

    const arrivedCount = await ReceivedInvitation.countDocuments({ invitation: id, checkedIn: true });
    res.status(200).json({ status: 'ok', message: 'Check-in reversed', arrivedCount });
  } catch (err) {
    console.error('Undo Check-in Error:', err);
    res.status(500).json({ message: 'Error reversing check-in' });
  }
};

module.exports = { getMyTicket, checkIn, undoCheckIn };
