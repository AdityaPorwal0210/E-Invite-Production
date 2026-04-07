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
  verifyPhoneSync // <-- NEW IMPORT
} = require("../controllers/userController");
const userController = require('../controllers/userController');
const { protect } = require("../middleware/authMiddleware");
console.log("Check Imports:", { requestPhoneSync, verifyPhoneSync });
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google-login", googleLogin);
router.post("/verify-otp", verifyOTP);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// <-- NEW PROTECTED ROUTE FOR PHONE SYNC -->
router.post("/sync-phone/request", protect, requestPhoneSync);
router.post("/sync-phone/verify", protect, verifyPhoneSync);

router.post('/sync-phone/verify', protect, userController.verifyPhoneSync);

router.get("/search", protect, searchUsers);
router.get("/notifications/counts", protect, getNotificationCounts);
router.put("/profile", protect, updateUserProfile);
router.delete("/profile", protect, deleteUserProfile);

router.put('/push-token', protect, updatePushToken);

router.post('/test-push', protect, testPushNotification);
module.exports = router;