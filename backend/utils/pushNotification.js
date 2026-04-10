const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
let expo = new Expo();

const sendPushNotification = async (targetToken, title, body, data = {}) => {
  // 1. Check if the token is formatted correctly
  if (!Expo.isExpoPushToken(targetToken)) {
    console.error(`Push token ${targetToken} is not a valid Expo push token`);
    return;
  }

  // 2. Construct the message payload
  const messages = [{
    to: targetToken,
    sound: 'default',
    title: title,
    body: body,
    data: data, // You can pass hidden data here (like an Event ID) to deep link later
  }];

  // 3. Send it to Expo's servers
  try {
    let chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log("🎟️ Push Ticket received:", ticketChunk);
    }
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
  }
};

module.exports = sendPushNotification;