export const optimizeCloudinaryUrl = (url, width = 800) => {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) {
    return url;
  }

  const parts = url.split('/upload/');
  
  if (parts.length === 2) {
    return `${parts[0]}/upload/f_auto,q_auto,w_${width},c_limit/${parts[1]}`;
  }

  return url;
};