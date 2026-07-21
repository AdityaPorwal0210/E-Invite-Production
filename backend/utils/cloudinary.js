const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto'
    });

    fs.unlinkSync(localFilePath);
    // Return only the secure URL to avoid mixed content warnings
    return { url: response.secure_url };
  } catch (error) {
    console.error("Cloudinary Error Details:", error); // <-- ADD THIS LINE
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return null;
  }
};

const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
    try {
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId, { type: 'authenticated', resource_type: resourceType });
    } catch (error) {
        // Fall back to default type in case it was a public asset
        try { await cloudinary.uploader.destroy(publicId); } catch (e) { /* ignore */ }
        console.error("Cloudinary deletion failed:", error);
    }
};

/**
 * Upload a sensitive document (ID) with AUTHENTICATED delivery — the asset is
 * NOT reachable via a plain public URL. Returns the publicId + format; a signed
 * link is generated separately, on demand, when an authorised user views it.
 */
const uploadPrivateDocument = async (localFilePath, folder = 'guest_ids') => {
  try {
    if (!localFilePath) return null;

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'image',
      type: 'authenticated', // key: not publicly accessible
      folder,
    });

    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

    return { publicId: response.public_id, format: response.format };
  } catch (error) {
    console.error("Cloudinary private upload failed:", error);
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    return null;
  }
};

/**
 * Generate a short-lived signed URL for an authenticated asset.
 * Only issued by the backend to an authorised viewer (host or the owning guest).
 * Default expiry: 5 minutes.
 */
const getSignedDocumentUrl = (publicId, { format = 'jpg', expiresInSeconds = 300 } = {}) => {
  if (!publicId) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    format,
    sign_url: true,
    secure: true,
    expires_at: expiresAt,
  });
};

module.exports = {
  uploadOnCloudinary,
  deleteFromCloudinary,
  uploadPrivateDocument,
  getSignedDocumentUrl,
};