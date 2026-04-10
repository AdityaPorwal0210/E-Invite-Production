const cron = require('node-cron');
const Invitation = require('../models/Invitation');
const ReceivedInvitation = require('../models/ReceivedInvitation');
const User = require('../models/User');
const sendPushNotification = require('./pushNotification');

const startReminderCron = () => {
  // This cron expression '0 * * * *' means "Run at minute 0 of every hour"
  cron.schedule('0 * * * *', async () => {
    console.log('🤖 CRON WAKEUP: Checking for 24-hour event reminders...');

    try {
      // 1. Define our time window (Events happening exactly 24 to 25 hours from right now)
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowPlusOneHour = new Date(tomorrow.getTime() + 60 * 60 * 1000);

      // 2. Find all events starting in that specific 1-hour window
      const upcomingEvents = await Invitation.find({
        eventDate: {
          $gte: tomorrow,
          $lt: tomorrowPlusOneHour
        }
      });

      if (upcomingEvents.length === 0) {
        console.log('No events require reminders this hour.');
        return;
      }

      // 3. For each event, find the guests and send the ping
      for (const event of upcomingEvents) {
        // Find everyone who RSVP'd "accepted" (Going) to this specific event
        const guests = await ReceivedInvitation.find({
          invitation: event._id,
          rsvpStatus: 'accepted'
        });

        for (const guestRecord of guests) {
          // Look up their user profile to get their Push Token
          const guestUser = await User.findById(guestRecord.recipient);
          
          if (guestUser && guestUser.expoPushToken) {
            await sendPushNotification(
              guestUser.expoPushToken,
              "Reminder: Event Tomorrow! ⏰",
              `Get ready! "${event.title}" is happening in exactly 24 hours.`,
              { eventId: event._id }
            );
          }
        }
        console.log(`✅ Sent ${guests.length} reminders for event: ${event.title}`);
      }
    } catch (error) {
      console.error('❌ CRON ERROR: Failed to process event reminders:', error);
    }
  });

  console.log('⏰ Automated Event Reminder Cron Job initialized.');
};

module.exports = startReminderCron;