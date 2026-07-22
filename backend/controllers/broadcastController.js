const Invitation = require('../models/Invitation');
const ReceivedInvitation = require('../models/ReceivedInvitation');
const sendEmail = require('../utils/sendEmail');
const sendPushNotification = require('../utils/pushNotification');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://invitoinnbox.vercel.app';

// @route POST /api/invitations/:id/broadcast
// @desc  Host sends an update/announcement to guests (push + email)
// @body  { message, audience }  audience = 'all' | 'going' | 'pending' | 'tag:<Tag>'
const broadcast = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, audience = 'all' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'A message is required' });
    }

    const invitation = await Invitation.findById(id);
    if (!invitation) return res.status(404).json({ message: 'Event not found' });

    const isHost = invitation.user.toString() === req.user.id;
    const isDelegate = invitation.delegates && invitation.delegates.some(d => d.toString() === req.user.id);
    if (!isHost && !isDelegate) return res.status(403).json({ message: 'Not authorized for this event' });

    // Build the audience filter
    const filter = { invitation: id };
    if (audience === 'going') filter.rsvpStatus = 'accepted';
    else if (audience === 'pending') filter.rsvpStatus = { $nin: ['accepted', 'declined'] };
    else if (typeof audience === 'string' && audience.startsWith('tag:')) {
      filter.tags = audience.slice(4).trim();
    }

    const recipients = await ReceivedInvitation.find(filter).populate('recipient', 'name email expoPushToken');
    if (recipients.length === 0) {
      return res.status(200).json({ message: 'No guests match that audience', sent: 0 });
    }

    const text = message.trim();
    const eventUrl = `${FRONTEND_URL}/invitation/${invitation._id}`;
    let sent = 0;

    for (const r of recipients) {
      const g = r.recipient;
      if (!g) continue;

      if (g.expoPushToken) {
        try {
          await sendPushNotification(
            g.expoPushToken,
            `Update: ${invitation.title}`,
            text,
            { type: 'broadcast', invitationId: invitation._id.toString(), url: `hostapp://event/${invitation._id}` }
          );
        } catch (e) { /* continue */ }
      }

      if (g.email && !g.email.includes('@placeholder.com')) {
        try {
          await sendEmail({
            to: g.email,
            subject: `Update about ${invitation.title}`,
            text: `Hello ${g.name || 'Guest'},\n\nA message from the host of "${invitation.title}":\n\n${text}\n\nEvent details: ${eventUrl}`,
          });
        } catch (e) { /* continue */ }
      }
      sent++;
    }

    res.status(200).json({ message: `Message sent to ${sent} guest${sent === 1 ? '' : 's'}`, sent });
  } catch (err) {
    console.error('Broadcast Error:', err);
    res.status(500).json({ message: 'Error sending message' });
  }
};

module.exports = { broadcast };
