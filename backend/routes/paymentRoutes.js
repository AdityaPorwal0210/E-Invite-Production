const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment, getLimits } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

router.get('/limits', getLimits);
router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verifyPayment);

module.exports = router;
