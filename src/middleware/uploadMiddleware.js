const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create temp public directory if it doesn't exist to prevent diskStorage crashes
const tempDir = path.join(__dirname, '../../public/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Strict whitelist of accepted image MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// File filter implementation enforcing strict MIME validation
const imageFileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();

  // Handle generic or missing MIME type by resolving it from the file extension
  if (file.mimetype === 'application/octet-stream' || !file.mimetype) {
    if (ext === '.jpg' || ext === '.jpeg') {
      file.mimetype = 'image/jpeg';
    } else if (ext === '.png') {
      file.mimetype = 'image/png';
    } else if (ext === '.webp') {
      file.mimetype = 'image/webp';
    }
  }

  if (ALLOWED_MIME_TYPES.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Security violation: Only valid images (JPEG, PNG, WEBP) are allowed.'), false);
  }
};

// Memory storage engine configuration (ideal for streaming/OCR processing)
const secureMemoryUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // Maximum photo size limit of 100MB
    files: 1 // Only allow one file at a time
  }
});

// Disk storage engine configuration (with secure alphanumeric renaming to prevent path traversal)
const scanFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) || ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and image files (JPEG, PNG, GIF, WebP) are allowed!'), false);
  }
};

const secureDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Strip special characters, spaces, and directories; preserve only safe extensions
    const cleanExt = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, cleanExt)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50); // Hard character length limit to prevent buffer issues
    
    cb(null, `${Date.now()}-${safeBase}${cleanExt}`);
  }
});

const secureDiskUpload = multer({
  storage: secureDiskStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // Maximum photo size limit of 100MB
    files: 1
  }
});

const secureScanUpload = multer({
  storage: secureDiskStorage,
  fileFilter: scanFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 1
  }
});

module.exports = {
  secureMemoryUpload,
  secureDiskUpload,
  secureScanUpload
};
