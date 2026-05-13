const Razorpay = require('razorpay');
const crypto = require('crypto');
const Invitation = require('../models/Invitation');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PREMIUM_PRICE_PAISE = 41900; // ₹419 (~$4.99 USD) in paise
const FREE_GUEST_LIMIT = 50;

// @desc   Create a Razorpay order for upgrading an event to premium
// @route  POST /api/payments/create-order
// @access Private
const createOrder = async (req, res) => {
  try {
    const { invitationId } = req.body;

    const invitation = await Invitation.findById(invitationId);
    if (!invitation) return res.status(404).json({ message: 'Event not found' });

    // Only the host can upgrade
    if (invitation.host.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the host can upgrade this event' });
    }

    if (invitation.isPremium) {
      return res.status(400).json({ message: 'This event is already premium' });
    }

    const order = await razorpay.orders.create({
      amount: PREMIUM_PRICE_PAISE,
      currency: 'INR',
      receipt: `inv_${invitationId}`,
      notes: {
        invitationId: invitationId,
        userId: req.user.id,
      },
    });

    res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({ message: 'Failed to create payment order' });
  }
};

// @desc   Verify payment signature and mark event as premium
// @route  POST /api/payments/verify
// @access Private
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invitationId } = req.body;

    // Verify the signature using HMAC-SHA256
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed. Invalid signature.' });
    }

    // Signature valid — mark event as premium
    const invitation = await Invitation.findByIdAndUpdate(
      invitationId,
      {
        isPremium: true,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      },
      { new: true }
    );

    if (!invitation) return res.status(404).json({ message: 'Event not found' });

    console.log(`✅ Event ${invitationId} upgraded to premium. Payment: ${razorpay_payment_id}`);

    res.status(200).json({
      message: 'Payment verified! Your event is now premium.',
      invitation,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Payment verification failed' });
  }
};

// @desc   Get the free guest limit (for frontend to use)
// @route  GET /api/payments/limits
// @access Public
const getLimits = (req, res) => {
  res.status(200).json({ freeGuestLimit: FREE_GUEST_LIMIT });
};

module.exports = { createOrder, verifyPayment, getLimits, FREE_GUEST_LIMIT };
