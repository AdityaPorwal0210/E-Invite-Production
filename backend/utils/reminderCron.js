const cron = require('node-cron');
const Invitation = require('../models/Invitation');
const ReceivedInvitation = require('../models/ReceivedInvitation');
const sendPushNotification = require('./pushNotification');

const startReminderCron = () => {
  // This cron expression '0 * * * *' means "Run at minute 0 of every hour"
  cron.schedule('0 * * * *', async () => {
    console.log('🤖 CRON WAKEUP: Checking for 24-hour event reminders...');

    try {
      const now = new Date();
      // Look for events happening between 23 and 24 hours from right now
      const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // 1. Find events in the window that HAVE NOT been processed yet
      const upcomingEvents = await Invitation.find({
        eventDate: {
          $gte: windowStart,
          $lt: windowEnd
        },
        reminderSent: { $ne: true } // THE SAFETY LOCK
      });

      if (upcomingEvents.length === 0) {
        console.log('No events require reminders this hour.');
        return;
      }

      // 2. Process each event
      for (const event of upcomingEvents) {
        // 🚨 LOCK THE EVENT IMMEDIATELY to prevent duplicate processing 
        event.reminderSent = true;
        await event.save();

        // 3. Find everyone who RSVP'd "accepted" (Going) 
        // Use .populate() to get the User data in ONE query instead of a loop
        const guests = await ReceivedInvitation.find({
          invitation: event._id,
          rsvpStatus: 'accepted'
        }).populate('recipient');

        let sentCount = 0;

        for (const guestRecord of guests) {
          const guestUser = guestRecord.recipient;
          
          if (guestUser && guestUser.expoPushToken) {
            try {
              await sendPushNotification(
                guestUser.expoPushToken,
                "Reminder: Event Tomorrow! ⏰",
                `Get ready! "${event.title}" is happening in exactly 24 hours.`,
                { eventId: event._id.toString() }
              );
              sentCount++;
            } catch (pushErr) {
              console.error(`Failed to send push to ${guestUser.email}:`, pushErr.message);
            }
          }
        }
        console.log(`✅ Sent ${sentCount} reminders for event: ${event.title}`);
      }
    } catch (error) {
      console.error('❌ CRON ERROR: Failed to process event reminders:', error);
    }
  });

  console.log('⏰ Automated Event Reminder Cron Job initialized.');
};

module.exports = startReminderCron;