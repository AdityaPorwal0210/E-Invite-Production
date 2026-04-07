// utils/pushHelper.js

const sendPushNotification = async (expoPushToken, title, body) => {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
    console.log("❌ Invalid push token format:", expoPushToken);
    return false;
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: { testData: 'This is a test routing payload' },
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    const result = await response.json();
    console.log("✅ Expo Server Response:", result);
    return true;
  } catch (error) {
    console.error("❌ Error sending push notification:", error);
    return false;
  }
};

module.exports = { sendPushNotification };