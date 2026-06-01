const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto',
    });
    // Remove locally saved temporary file
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    // Retain locally saved temporary file if upload failed to allow local fallback serving
    console.error('[Cloudinary] Upload failed, retaining file for local fallback:', error.message);
    return null;
  }
};
