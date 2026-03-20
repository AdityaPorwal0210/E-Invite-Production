const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@example.com';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'E-Invite';

const sendEmail = async ({ to, subject, text }) => {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: {
          name: BREVO_SENDER_NAME,
          email: BREVO_SENDER_EMAIL
        },
        to: [
          {
            email: to
          }
        ],
        subject: subject,
        textContent: text
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Brevo API error');
    }

    console.log(`Email sent to ${to} via Brevo`);
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
};

module.exports = sendEmail;
