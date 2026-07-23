const express = require("express");
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  verifyOTP, 
  searchUsers, 
  deleteUserProfile, 
  updateUserProfile, 
  forgotPassword, 
  resetPassword, 
  getNotificationCounts, 
  googleLogin,
  requestPhoneSync,
  updatePushToken,
  testPushNotification,
  verifyPhoneSync,
  requestSecondaryPhoneSync,
  verifySecondaryPhoneSync
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const rateLimit = require('express-rate-limit');


// Strict limiter for credential/OTP endpoints — blunts brute-force and OTP guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,                  // 15 attempts per IP per window
  message: { message: "Too many attempts. Please wait a few minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/google-login", authLimiter, googleLogin);
router.post("/verify-otp", authLimiter, verifyOTP);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

// <-- NEW PROTECTED ROUTE FOR PHONE SYNC -->
router.post("/sync-phone/request", protect, requestPhoneSync);
router.post("/sync-phone/verify", protect, verifyPhoneSync);

router.post("/sync-secondary-phone/request", protect, requestSecondaryPhoneSync);
router.post("/sync-secondary-phone/verify", protect, verifySecondaryPhoneSync);

router.get("/search", protect, searchUsers);
router.get("/notifications/counts", protect, getNotificationCounts);
router.put("/profile", protect, updateUserProfile);
router.delete("/profile", protect, deleteUserProfile);

router.put('/push-token', protect, updatePushToken);

router.post('/test-push', protect, testPushNotification);
module.exports = router;