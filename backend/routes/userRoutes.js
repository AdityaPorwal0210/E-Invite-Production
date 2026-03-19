const express = require("express");
const router = express.Router();
const { registerUser, loginUser, verifyOTP, searchUsers, deleteUserProfile, updateUserProfile, forgotPassword, resetPassword, getNotificationCounts } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/verify-otp", verifyOTP);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/search", protect, searchUsers);
router.get("/notifications/counts", protect, getNotificationCounts);
router.put("/profile", protect, updateUserProfile);
router.delete("/profile", protect, deleteUserProfile);

module.exports = router;
