const sharp = require('sharp');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// 1. IMAGE PREPROCESSOR SERVICE
class ImagePreprocessor {
  static async preprocess(src) {
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

      // Grayscale + normalize dynamic range + linear contrast scaling + edge sharpening
      const processedBuffer = await sharp(inputBuffer)
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalize()
        .linear(1.4, -0.15) // Boosts contrast, separating thin lines from paper grey
        .sharpen({ sigma: 1.2, flat: 1.0, jagged: 2.0 }) // Heightens mathematical symbol outlines
        .toBuffer();

      return `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;
    } catch (error) {
      console.error('ImagePreprocessor Error:', error.message);
      return src; // Graceful fallback to original image source
    }
  }
}

// 2. OCR SERVICE (Mathpix + Retry Handler with Exponential Backoff)
class OCRService {
  static async performOcr(processedSrc) {
    const appId = process.env.MATHPIX_API_ID;
    const appKey = process.env.MATHPIX_API_KEY;

    if (!appId || !appKey) {
      throw new Error('Mathpix API credentials are not configured in your environment variables.');
    }

    const payload = {
      src: processedSrc,
      formats: ['text', 'latex_styled'],
      data_options: {
        include_latex: true,
      },
      math_inline_delimiters: ['$', '$'],
      math_display_delimiters: ['$$', '$$'],
    };

    const maxRetries = 3;
    let attempt = 0;
    let delay = 1000; // Start with 1 second retry delay

    while (attempt < maxRetries) {
      try {
        const response = await fetch('https://api.mathpix.com/v3/text', {
          method: 'POST',
          headers: {
            'app_id': appId,
            'app_key': appKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          timeout: 25000, // 25 second timeout per call
        });

        const result = await response.json();
        
        if (!response.ok) {
          console.error(`Mathpix Attempt ${attempt + 1} Failed:`, result);
          throw new Error(result?.error || result?.message || `HTTP ${response.status}`);
        }

        return result;
      } catch (error) {
        attempt++;
        console.warn(`Mathpix API Attempt ${attempt} failed: ${error.message}`);
        if (attempt >= maxRetries) {
          throw new Error(`Mathpix API call exhausted all retries. Last error: ${error.message}`);
        }
        // Exponential backoff delay
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }
}

// 3. MCQ DETECTOR SERVICE
class MCQDetector {
  static detect(text) {
    if (!text) return null;

    // Normalizes inline math spacing before segmenting
    const cleanedText = text.replace(/\s+/g, ' ').trim();

    // 1. INLINE MCQ DETECTION (e.g., "What is 2+2? (A) 3 (B) 4 (C) 5 (D) 6")
    const inlinePattern = /[\(\[]?([a-dA-D1-4i-vI-V])[\)\]\.\-]\s*([^()\[\]\n]+?)(?=\s*[\(\[]?[a-dA-D1-4i-vI-V][\)\]\.\-]\s*|$)/g;
    const inlineMatches = [...cleanedText.matchAll(inlinePattern)];
    
    if (inlineMatches.length >= 4) {
      const options = [];
      const labels = ['A', 'B', 'C', 'D'];
      for (let i = 0; i < 4; i++) {
        options.push({
          label: labels[i],
          text: inlineMatches[i][2].trim()
        });
      }
      
      const firstOptionIndex = cleanedText.indexOf(inlineMatches[0][0]);
      const questionText = firstOptionIndex > 0 ? cleanedText.substring(0, firstOptionIndex).trim() : cleanedText;
      return {
        question: questionText,
        options
      };
    }

    // 2. LINE-BY-LINE MCQ DETECTION (Supports multi-line, paragraph-form, and custom label options)
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let firstOptionLineIndex = -1;
    const options = [];
    const labels = ['A', 'B', 'C', 'D'];
    let currentOption = null;

    // Matches Option Labels like: (A), A., a), (i), i.
    const optionRegex = /^\s*[\(\[]?([a-dA-D1-4]||i|ii|iii|iv||I|II|III|IV)[\)\]\.\-]\s*(.*)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(optionRegex);
      if (match) {
        if (firstOptionLineIndex === -1) {
          firstOptionLineIndex = i;
        }

        const rawLabel = match[1].toUpperCase();
        let label = 'A';
        if (rawLabel === 'B' || rawLabel === '2' || rawLabel === 'II') label = 'B';
        else if (rawLabel === 'C' || rawLabel === '3' || rawLabel === 'III') label = 'C';
        else if (rawLabel === 'D' || rawLabel === '4' || rawLabel === 'IV') label = 'D';
        else {
          label = labels[options.length] || 'A';
        }

        currentOption = {
          label,
          text: match[2].trim()
        };
        options.push(currentOption);
      } else {
        // Appends to the previous option if we've already hit the options block (supporting multi-line options)
        if (currentOption) {
          currentOption.text += ' ' + line;
        }
      }
    }

    if (options.length >= 2) {
      const questionText = lines.slice(0, firstOptionLineIndex).join('\n').trim();
      while (options.length < 4) {
        options.push({
          label: labels[options.length],
          text: ''
        });
      }
      return {
        question: questionText,
        options: options.slice(0, 4)
      };
    }

    return null;
  }
}

// 4. LATEX SANITIZER SERVICE
class LatexSanitizer {
  static sanitize(latex) {
    if (!latex) return '';

    let sanitized = latex;

    // Convert display block math to standardized KaTeX $ inline elements
    sanitized = sanitized.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$');
    sanitized = sanitized.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

    // Balance unclosed math structures & environments
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

    // Auto-balance math structural brackets {}
    let openBraces = 0;
    let closeBraces = 0;
    for (let i = 0; i < sanitized.length; i++) {
      if (sanitized[i] === '{' && (i === 0 || sanitized[i - 1] !== '\\')) openBraces++;
      else if (sanitized[i] === '}' && (i === 0 || sanitized[i - 1] !== '\\')) closeBraces++;
    }
    if (openBraces > closeBraces) {
      sanitized += '}'.repeat(openBraces - closeBraces);
    }

    // Auto-balance square brackets []
    let openSquare = 0;
    let closeSquare = 0;
    for (let i = 0; i < sanitized.length; i++) {
      if (sanitized[i] === '[' && (i === 0 || sanitized[i - 1] !== '\\')) openSquare++;
      else if (sanitized[i] === ']' && (i === 0 || sanitized[i - 1] !== '\\')) closeSquare++;
    }
    if (openSquare > closeSquare) {
      sanitized += ']'.repeat(openSquare - closeSquare);
    }

    // Balance inline dollar signs $
    let dollarCount = 0;
    for (let i = 0; i < sanitized.length; i++) {
      if (sanitized[i] === '$' && (i === 0 || sanitized[i - 1] !== '\\')) {
        dollarCount++;
      }
    }
    if (dollarCount % 2 !== 0) {
      sanitized += '$'; // Close the hanging math block
    }

    // Clean Mathpix native OCR sizing noise that breaks WebViews
    sanitized = sanitized.replace(/\\Big\s*([()\[\]{}|])/g, '$1');
    sanitized = sanitized.replace(/\\bigg\s*([()\[\]{}|])/g, '$1');
    sanitized = sanitized.replace(/\\text\s*{(.*?)}/g, '$1');

    return sanitized;
  }
}

// 5. OCR RESULT VALIDATOR
class OCRResultValidator {
  static validate(result) {
    const rawLatex = result.latex_styled || '';
    const confidence = result.latex_confidence || result.confidence || 1.0;

    let rating = 'high';
    if (confidence < 0.6) {
      rating = 'low';
    } else if (confidence < 0.85) {
      rating = 'medium';
    }

    // Validate if LaTeX rendering syntax contains clear corruption
    const isCorrupt = rawLatex.includes('\\begin') && !rawLatex.includes('\\end');

    return {
      confidence,
      rating,
      isValid: !isCorrupt && rawLatex.trim().length > 0
    };
  }
}

// Unified Orchestrated Pipeline
class OCRPipeline {
  static async run(src) {
    // Step 1: Preprocess Image
    const preprocessedSrc = await ImagePreprocessor.preprocess(src);

    // Step 2: Query Mathpix OCR Service with Retry logic
    const ocrRaw = await OCRService.performOcr(preprocessedSrc);

    // Step 3: Sanitize LaTeX content
    const rawLatex = ocrRaw.latex_styled || ocrRaw.text || '';
    const sanitizedLatex = LatexSanitizer.sanitize(rawLatex);

    // Step 4: Run MCQ Option Segmentation
    const parsedMcq = MCQDetector.detect(sanitizedLatex) || MCQDetector.detect(ocrRaw.text);

    // Step 5: Validate OCR confidence and quality
    const validation = OCRResultValidator.validate(ocrRaw);

    return {
      rawText: ocrRaw.text || '',
      latex: sanitizedLatex,
      parsedMcq,
      confidence: validation.confidence,
      qualityRating: validation.rating,
      isValid: validation.isValid
    };
  }
}

module.exports = {
  ImagePreprocessor,
  OCRService,
  MCQDetector,
  LatexSanitizer,
  OCRResultValidator,
  OCRPipeline
};
