const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const sharp = require('sharp');

const MATHPIX_URL = 'https://api.mathpix.com/v3/text';

const getMathpixCredentials = () => {
  const appId = process.env.MATHPIX_API_ID;
  const appKey = process.env.MATHPIX_API_KEY;

  if (!appId || !appKey) {
    throw new Error('Mathpix credentials are not configured');
  }

  return { appId, appKey };
};

const preprocessImage = async (src) => {
  try {
    let inputBuffer;
    if (src.startsWith('data:')) {
      const base64Data = src.split(',')[1];
      inputBuffer = Buffer.from(base64Data, 'base64');
    } else if (src.startsWith('http')) {
      const response = await fetch(src);
      inputBuffer = await response.buffer();
    } else {
      inputBuffer = Buffer.from(src, 'base64');
    }

    // Adaptive contrast stretch, sharpening and binarization preparation
    const processedBuffer = await sharp(inputBuffer)
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .normalize() // Stretch dynamic range
      .linear(1.4, -0.15) // Enhance contrast to separate faint text/handwriting from background
      .sharpen({ sigma: 1.2, flat: 1.0, jagged: 2.0 }) // Sharpen edges of math symbols
      .toBuffer();

    return `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;
  } catch (error) {
    console.error('Advanced Image Preprocessing Error:', error.message);
    return src; // Fallback to original if preprocessing fails
  }
};

const sanitizeLatex = (latex) => {
  if (!latex) return '';

  let sanitized = latex;

  // 1. Convert block and inline LaTeX delimiters safely to standard dollar signs
  sanitized = sanitized.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$');
  sanitized = sanitized.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

  // 2. Fix unclosed environments (e.g. matrices, aligned structures, cases, arrays)
  const environments = ['matrix', 'pmatrix', 'bmatrix', 'align', 'cases', 'array', 'vmatrix'];
  for (const env of environments) {
    const beginCount = (sanitized.match(new RegExp(`\\\\begin{${env}}`, 'g')) || []).length;
    const endCount = (sanitized.match(new RegExp(`\\\\end{${env}}`, 'g')) || []).length;
    if (beginCount > endCount) {
      for (let i = 0; i < beginCount - endCount; i++) {
        sanitized += ` \\end{${env}}`;
      }
    }
  }

  // 3. Balance curly braces {} (extremely critical for fractions, matrices, indices, roots)
  let openBraces = 0;
  let closeBraces = 0;
  for (let i = 0; i < sanitized.length; i++) {
    if (sanitized[i] === '{' && (i === 0 || sanitized[i - 1] !== '\\')) {
      openBraces++;
    } else if (sanitized[i] === '}' && (i === 0 || sanitized[i - 1] !== '\\')) {
      closeBraces++;
    }
  }
  if (openBraces > closeBraces) {
    sanitized += '}'.repeat(openBraces - closeBraces);
  }

  // 4. Balance square brackets []
  let openSquare = 0;
  let closeSquare = 0;
  for (let i = 0; i < sanitized.length; i++) {
    if (sanitized[i] === '[' && (i === 0 || sanitized[i - 1] !== '\\')) {
      openSquare++;
    } else if (sanitized[i] === ']' && (i === 0 || sanitized[i - 1] !== '\\')) {
      closeSquare++;
    }
  }
  if (openSquare > closeSquare) {
    sanitized += ']'.repeat(openSquare - closeSquare);
  }

  // 5. Clean dangling math operators (like subscript/superscript without following letters or blocks)
  sanitized = sanitized.replace(/([^_a-zA-Z0-9])\^(\s*($|[\)\$]))/g, '$1$2');
  sanitized = sanitized.replace(/([^_a-zA-Z0-9])_(\s*($|[\)\$]))/g, '$1$2');

  // 6. Clean common OCR noise that breaks KaTeX
  sanitized = sanitized.replace(/\\Big\s*([()\[\]{}|])/g, '$1');
  sanitized = sanitized.replace(/\\bigg\s*([()\[\]{}|])/g, '$1');

  return sanitized;
};

const buildPayload = (src) => ({
  src,
  formats: ['text', 'latex_styled'],
  data_options: {
    include_latex: true,
  },
  math_inline_delimiters: ['$', '$'],
  math_display_delimiters: ['$$', '$$'],
});

exports.processImage = async (src) => {
  const { appId, appKey } = getMathpixCredentials();
  
  // Preprocess image before sending to Mathpix
  const processedSrc = await preprocessImage(src);
  
  try {
    const response = await fetch(MATHPIX_URL, {
      method: 'POST',
      headers: {
        'app_id': appId,
        'app_key': appKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPayload(processedSrc)),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Mathpix API Error Response:', result);
      const msg = result?.error || result?.message || `Mathpix request failed (${response.status})`;
      throw new Error(msg);
    }

    // Post-process LaTeX to ensure it's KaTeX-friendly and fully balanced
    const rawLatex = result.latex_styled || '';
    const latex = sanitizeLatex(rawLatex);

    // Capture confidence score if returned by Mathpix
    const confidence = result?.latex_confidence || result?.confidence || 1.0;

    return {
      text: result.text || '',
      latex: latex,
      confidence: confidence,
      raw: result,
    };
  } catch (error) {
    console.error('Mathpix Service Exception:', error.message);
    throw error;
  }
};
