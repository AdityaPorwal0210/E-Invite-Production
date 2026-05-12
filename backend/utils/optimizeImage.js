export const optimizeCloudinaryUrl = (url, width = 800) => {
  // If it's empty, a local file, or not a Cloudinary link, leave it alone
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) {
    return url;
  }

  // Split the URL at '/upload/' to inject our transformation parameters
  const parts = url.split('/upload/');
  
  if (parts.length === 2) {
    // Inject auto-format, auto-quality, and width limit
    return `${parts[0]}/upload/f_auto,q_auto,w_${width},c_limit/${parts[1]}`;
  }

  return url;
};