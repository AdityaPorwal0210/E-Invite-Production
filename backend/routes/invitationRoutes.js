const express = require("express");
const router = express.Router();

const { createInvitation, getInvitations, getInvitationById, updateRSVP, getReceivedInvitations, getSavedInvitations, updateInvitation, deleteInvitation, getPublicInvitation, getTeaser, revokeInvite, shareInvitationLater, toggleSaveInvitation, getEventGuestList, removeGuest, markAsRead } = require("../controllers/invitationController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/multer.middleware");

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
router.post("/create", protect, upload.array('attachments', 5), createInvitation);
router.post("/:id/share", protect, shareInvitationLater);
router.put("/:id/rsvp", protect, updateRSVP);
router.put("/:id/revoke", protect, revokeInvite);
router.put("/:id/save", protect, toggleSaveInvitation);
router.put("/:id/read", protect, markAsRead);
router.put("/:id", protect, upload.single("coverImage"), updateInvitation);
router.delete("/:id", protect, deleteInvitation);

module.exports = router;
