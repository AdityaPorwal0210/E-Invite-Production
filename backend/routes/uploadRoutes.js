const express = require("express");
const router = express.Router();
const { uploadImage } = require("../controllers/uploadController");
const { protect } = require("../middleware/authMiddleware");
const { upload } = require("../config/cloudinary");

// POST /api/upload - Upload an image
router.post("/", protect, upload.single('image'), uploadImage);

module.exports = router;
