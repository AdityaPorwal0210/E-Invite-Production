// Upload image controller
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Return the Cloudinary URL
    res.status(200).json({
      url: req.file.path,
      publicId: req.file.filename
    });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ message: "Error uploading image" });
  }
};

module.exports = { uploadImage };
