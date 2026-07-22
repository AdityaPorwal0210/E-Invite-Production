const cron = require('node-cron');
const Invitation = require('../models/Invitation');
const ReceivedInvitation = require('../models/ReceivedInvitation');
const { nudgeGuests, PENDING_FILTER } = require('../controllers/rsvpReminderController');

// Send one automatic reminder to a non-responder this many days after inviting.
const NUDGE_AFTER_DAYS = Number(process.env.RSVP_NUDGE_AFTER_DAYS || 3);
// Never auto-nudge more than this many times per guest.
const MAX_AUTO_NUDGES = 1;

/**
 * Runs daily. For upcoming events, nudges guests who still haven't responded,
 * were invited at least NUDGE_AFTER_DAYS ago, and haven't been auto-nudged yet.
 */
const startRsvpNudgeCron = () => {
  // '0 10 * * *' → every day at 10:00
  cron.schedule('0 10 * * *', async () => {
    console.log('🔔 CRON: Checking for RSVP non-responders to nudge...');
    try {
      const now = new Date();
      const invitedBefore = new Date(now.getTime() - NUDGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

      // Only events still in the future
      const upcoming = await Invitation.find({ eventDate: { $gt: now } });
      if (upcoming.length === 0) {
        console.log('No upcoming events for RSVP nudges.');
        return;
      }

      let totalNudged = 0;
      for (const invitation of upcoming) {
        const pending = await ReceivedInvitation.find({
          invitation: invitation._id,
          ...PENDING_FILTER,
          createdAt: { $lte: invitedBefore },
          nudgeCount: { $lt: MAX_AUTO_NUDGES },
        }).populate('recipient', 'name email expoPushToken');

        if (pending.length > 0) {
          totalNudged += await nudgeGuests(invitation, pending);
        }
      }

      console.log(`🔔 Auto-nudged ${totalNudged} non-responder(s).`);
    } catch (error) {
      console.error('❌ RSVP NUDGE CRON ERROR:', error);
    }
  });

  console.log(`🔔 RSVP auto-nudge cron initialized (after ${NUDGE_AFTER_DAYS} days, max ${MAX_AUTO_NUDGES}).`);
};

module.exports = startRsvpNudgeCron;
