const Invitation = require('../models/Invitation');
const ReceivedInvitation = require('../models/ReceivedInvitation');
const sendEmail = require('../utils/sendEmail');
const sendPushNotification = require('../utils/pushNotification');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://invitoinnbox.vercel.app';

// A guest is a "non-responder" until they explicitly accept or decline.
const PENDING_FILTER = { rsvpStatus: { $nin: ['accepted', 'declined'] } };

/**
 * Send an RSVP reminder to a set of ReceivedInvitation records for one event.
 * Sends push (if the guest has a token) and email (if a real address), then
 * records the nudge. Returns how many were reminded. Shared by the manual
 * host action and the automatic cron.
 */
const nudgeGuests = async (invitation, receivedRecords) => {
  let reminded = 0;
  const eventUrl = `${FRONTEND_URL}/invitation/${invitation._id}`;

  for (const record of receivedRecords) {
    const guest = record.recipient;
    if (!guest) continue;

    const salutation = record.salutation ? `${record.salutation} ` : '';
    const greeting = `Hello ${salutation}${guest.name || ''}`.trim();

    // Push
    if (guest.expoPushToken) {
      try {
        await sendPushNotification(
          guest.expoPushToken,
          'RSVP reminder',
          `Please let the host know if you're coming to "${invitation.title}".`,
          { type: 'rsvp_reminder', invitationId: invitation._id.toString(), url: `hostapp://event/${invitation._id}` }
        );
      } catch (e) { /* keep going */ }
    }

    // Email
    if (guest.email && !guest.email.includes('@placeholder.com')) {
      try {
        await sendEmail({
          to: guest.email,
          subject: `Reminder: please RSVP to ${invitation.title}`,
          text: `${greeting},\n\nThis is a friendly reminder to RSVP for "${invitation.title}" on ${new Date(invitation.eventDate).toLocaleDateString()}.\n\nPlease let the host know if you can make it:\n${eventUrl}\n\nThank you!`,
        });
      } catch (e) { /* keep going */ }
    }

    record.lastNudgeAt = new Date();
    record.nudgeCount = (record.nudgeCount || 0) + 1;
    await record.save();
    reminded++;
  }

  return reminded;
};

// @route POST /api/invitations/:id/remind-pending
// @desc  Host nudges everyone who hasn't responded yet
const remindPending = async (req, res) => {
  try {
    const { id } = req.params;
    const invitation = await Invitation.findById(id);
    if (!invitation) return res.status(404).json({ message: 'Event not found' });

    const isHost = invitation.user.toString() === req.user.id;
    const isDelegate = invitation.delegates && invitation.delegates.some(d => d.toString() === req.user.id);
    if (!isHost && !isDelegate) return res.status(403).json({ message: 'Not authorized for this event' });

    const pending = await ReceivedInvitation.find({ invitation: id, ...PENDING_FILTER })
      .populate('recipient', 'name email expoPushToken');

    if (pending.length === 0) {
      return res.status(200).json({ message: 'Everyone has already responded — no reminders needed', reminded: 0 });
    }

    // Soft guard: don't allow spamming the same list within 6 hours
    const recentlyNudged = pending.every(
      p => p.lastNudgeAt && (Date.now() - new Date(p.lastNudgeAt).getTime()) < 6 * 60 * 60 * 1000
    );
    if (recentlyNudged) {
      return res.status(429).json({ message: 'These guests were reminded recently. Try again later.' });
    }

    const reminded = await nudgeGuests(invitation, pending);
    res.status(200).json({ message: `Reminded ${reminded} guest${reminded === 1 ? '' : 's'}`, reminded });
  } catch (err) {
    console.error('Remind Pending Error:', err);
    res.status(500).json({ message: 'Error sending reminders' });
  }
};

module.exports = { remindPending, nudgeGuests, PENDING_FILTER };
