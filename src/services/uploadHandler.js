/**
 * UploadHandler Service
 * Enforces file size and MIME-type restrictions on uploaded media.
 */
class UploadHandler {
  static get allowedMimetypes() {
    return ['image/jpeg', 'image/png', 'image/webp'];
  }

  static get maxSizeBytes() {
    return 20 * 1024 * 1024; // 20MB
  }

  /**
   * Validates an uploaded file's metadata
   * @param {object} file - Multer file object
   */
  static validate(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!this.allowedMimetypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
    }

    if (file.size > this.maxSizeBytes) {
      throw new Error('File size exceeds the 20MB limit.');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('Empty file buffer received.');
    }

    return true;
  }
}

module.exports = { UploadHandler };
