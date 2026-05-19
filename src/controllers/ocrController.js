const mathpixService = require('../services/mathpixService');

const toDataUri = (base64Image) => (
  base64Image.startsWith('data:image')
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`
);

const bufferToDataUri = (buffer, mimetype) => {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
};

const resolveSource = (req) => {
  // 1. Check for file upload (highest priority, most memory efficient for client)
  if (req.file) {
    console.log('Resolving OCR source from file:', req.file.originalname, 'Size:', req.file.size);
    return bufferToDataUri(req.file.buffer, req.file.mimetype || 'image/jpeg');
  }
  // 2. Check for base64 in body
  if (req.body?.base64Image) {
    console.log('Resolving OCR source from base64 string');
    return toDataUri(req.body.base64Image);
  }
  // 3. Check for URL
  if (req.body?.imageUrl) {
    console.log('Resolving OCR source from URL:', req.body.imageUrl);
    return req.body.imageUrl;
  }
  return null;
};

exports.scanImage = async (req, res) => {
  try {
    const src = resolveSource(req);
    if (!src) {
      return res.status(400).json({
        success: false,
        message: 'Provide an image file, base64Image, or imageUrl',
      });
    }

    const result = await mathpixService.processImage(src);
    return res.json({
      success: true,
      data: {
        rawText: result.text,
        latex: result.latex,
        sourceType: req.file ? 'file' : (src.startsWith('http') ? 'url' : 'base64'),
      },
    });
  } catch (error) {
    const message = error.message || 'Failed to process image';
    const statusCode = message.toLowerCase().includes('credentials') ? 500 : 502;
    return res.status(statusCode).json({ success: false, message });
  }
};
