const express = require("express");
const router = express.Router();

const {
  createGuestList,
  getMyGuestLists,
  getGuestListById,
  updateGuestList,
  deleteGuestList,
  addGuests,
  updateGuest,
  removeGuest,
  duplicateGuestList,
  exportGuestList
} = require("../controllers/guestListController");

const { protect } = require("../middleware/authMiddleware");

// All guest list routes are private to the owning host
router.post("/", protect, createGuestList);
router.get("/", protect, getMyGuestLists);

// Specific routes must sit above the generic /:id route
router.get("/:id/export", protect, exportGuestList);
router.post("/:id/duplicate", protect, duplicateGuestList);

router.post("/:id/guests", protect, addGuests);
router.put("/:id/guests/:guestId", protect, updateGuest);
router.delete("/:id/guests/:guestId", protect, removeGuest);

router.get("/:id", protect, getGuestListById);
router.put("/:id", protect, updateGuestList);
router.delete("/:id", protect, deleteGuestList);

module.exports = router;
