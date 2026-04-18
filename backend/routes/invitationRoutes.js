const express = require("express");
const router = express.Router();
const rateLimit = require('express-rate-limit');

const { updateDelegates, createInvitation, getInvitations, getInvitationById, updateRSVP, getReceivedInvitations, getSavedInvitations, updateInvitation, deleteInvitation, getPublicInvitation, getTeaser, revokeInvite, shareInvitationLater, toggleSaveInvitation, getEventGuestList, removeGuest, markAsRead } = require("../controllers/invitationController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/multer.middleware");

// --- STRICT RATE LIMITER ---
// Prevents bots from spamming event creation and sending thousands of fake emails
const strictActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // Limit each IP to 10 creations/shares per hour
  message: { message: "You have reached the limit for creating or sharing events. Please try again in an hour to prevent spam." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes - no authentication required
router.get("/public/:id", getPublicInvitation);
router.get("/:id/teaser", getTeaser);

// Protected routes - must be ABOVE /:id to avoid ID collision
router.get("/received", protect, getReceivedInvitations);
router.get("/saved", protect, getSavedInvitations);
router.get("/", protect, getInvitations);
router.get("/:id", protect, getInvitationById);
router.get("/:id/guests", protect, getEventGuestList);
router.delete("/:id/guests/:guestId", protect, removeGuest);

// --- INJECTED STRICT LIMITER ON CREATION & SHARING ---
router.post("/create", protect, strictActionLimiter, upload.array('attachments', 5), createInvitation);
router.post("/:id/share", protect, strictActionLimiter, shareInvitationLater);

router.put("/:id/rsvp", protect, updateRSVP);
router.put("/:id/revoke", protect, revokeInvite);
router.put("/:id/save", protect, toggleSaveInvitation);
router.put("/:id/read", protect, markAsRead);
router.put("/:id", protect, upload.array("attachments", 5), updateInvitation);
router.delete("/:id", protect, deleteInvitation);
router.put("/:id/delegates", protect, updateDelegates);

module.exports = router;