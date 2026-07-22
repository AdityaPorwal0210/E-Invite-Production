const express = require("express");
const router = express.Router();
const rateLimit = require('express-rate-limit');

const { updateDelegates, createInvitation, getInvitations, getInvitationById, updateRSVP, getReceivedInvitations, getSavedInvitations, updateInvitation, deleteInvitation, getPublicInvitation, getTeaser, revokeInvite, shareInvitationLater, toggleSaveInvitation, getEventGuestList, updateGuestExpectedCount, removeGuest, markAsRead } = require("../controllers/invitationController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/multer.middleware");
const {
  setGuestTags,
  requestGuestId,
  cancelGuestId,
  requestIdByTag,
  getMyIdRequest,
  uploadMyId,
  viewIdDocument,
  deleteIdDocument,
} = require("../controllers/guestManagementController");
const { getMyTicket, checkIn, undoCheckIn } = require("../controllers/checkinController");
const { remindPending } = require("../controllers/rsvpReminderController");

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
router.put("/:id/guests/:guestId/expected", protect, updateGuestExpectedCount);

// --- Tags + ID collection (premium) ---
router.put("/:id/guests/:guestId/tags", protect, setGuestTags);
router.post("/:id/guests/:guestId/request-id", protect, requestGuestId);
router.post("/:id/guests/:guestId/cancel-id-request", protect, cancelGuestId);
router.post("/:id/request-id-by-tag", protect, requestIdByTag);
router.get("/:id/my-id-request", protect, getMyIdRequest);

// --- QR check-in ---
router.get("/:id/my-ticket", protect, getMyTicket);
router.post("/:id/checkin", protect, checkIn);
router.post("/:id/checkin/undo", protect, undoCheckIn);

// --- RSVP follow-up ---
router.post("/:id/remind-pending", protect, remindPending);
router.post("/:id/id-documents", protect, upload.array('documents', 3), uploadMyId);
router.get("/:id/guests/:guestId/id-documents/:docId/view", protect, viewIdDocument);
router.delete("/:id/guests/:guestId/id-documents/:docId", protect, deleteIdDocument);

router.delete("/:id/guests/:guestId", protect, removeGuest);

// --- INJECTED STRICT LIMITER ON CREATION & SHARING ---
router.post("/create", protect, strictActionLimiter, upload.array('attachments', 5), createInvitation);
router.post("/:id/share", protect, strictActionLimiter, shareInvitationLater);

router.put("/:id/rsvp", protect, updateRSVP);
router.put("/:id/revoke", protect, revokeInvite);
router.put("/:id/save", protect, toggleSaveInvitation);
router.put("/:id/read", protect, markAsRead);
router.put("/:id", protect, upload.fields([{ name: 'coverImage', maxCount: 1 }, { name: 'attachments', maxCount: 5 }]), updateInvitation);
router.delete("/:id", protect, deleteInvitation);
router.put("/:id/delegates", protect, updateDelegates);

module.exports = router;
