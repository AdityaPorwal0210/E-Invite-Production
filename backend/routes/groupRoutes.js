const express = require("express");
const router = express.Router();

const { 
  createGroup, 
  getMyGroups, 
  getGroupById, 
  getGroupInfoPublic,
  generateJoinLink,
  requestToJoin,
  updateGroupSettings,
  handleJoinRequest,
  approveRequest,
  rejectRequest,
  sendInvitationToGroup,
  leaveGroup,
  addMember,
  removeMember,
  toggleAdminStatus,
  deleteGroup,
  updateGroup,
  addMembersBulk
} = require("../controllers/groupController");
const { protect } = require("../middleware/authMiddleware");

// Public route - no authentication required
router.get("/:id/public", getGroupInfoPublic);
router.post('/:id/members/bulk', protect, addMembersBulk);
// All other routes are protected
router.post("/", protect, createGroup);
router.get("/", protect, getMyGroups);
router.get("/:id", protect, getGroupById);
router.put("/:id", protect, updateGroup);
router.put("/:id/settings", protect, updateGroupSettings);
router.post("/:id/request", protect, requestToJoin);
router.put("/:id/requests/handle", protect, handleJoinRequest);
router.post("/:id/join-link", protect, generateJoinLink);
router.post("/:id/leave", protect, leaveGroup);

// Approve/Reject requests (owner only)
router.post("/:groupId/approve/:userId", protect, approveRequest);
router.post("/:groupId/reject/:userId", protect, rejectRequest);

// Send invitation to group members
router.post("/:groupId/send-invitation/:invitationId", protect, sendInvitationToGroup);

// Member management
router.put("/:id/members", protect, addMember);
router.delete("/:id/members", protect, removeMember);
router.put("/:id/admins", protect, toggleAdminStatus);
router.delete("/:id", protect, deleteGroup);

module.exports = router;
