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

// 3. MCQ DETECTOR SERVICE with Enhanced Parsing
class MCQDetector {
  // Common MCQ option labels
  static OPTION_PATTERNS = [
    /^[\(\[]?([A-D]|[1-4]|[i-iv])[\)\]\.:\-\s]+(.*)$/i,
    /^([A-D]|[1-4])\s*[\.:\-]\s*(.*)$/i,
    /^option\s*([A-D])\s*[:\-]?\s*(.*)$/i,
  ];

  static detect(text) {
    if (!text || typeof text !== 'string') return null;

    // Normalize whitespace and text
    const cleanedText = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

    // Try inline MCQ first (e.g., "Which? (A) ans1 (B) ans2 (C) ans3 (D) ans4")
    const inlineMcq = this.detectInlineMCQ(cleanedText);
    if (inlineMcq) return inlineMcq;

    // Try line-by-line MCQ (most common format)
    const lineMcq = this.detectLineBasedMCQ(cleanedText);
    if (lineMcq) return lineMcq;

    // Try structured format with strong delimiters
    const structuredMcq = this.detectStructuredMCQ(cleanedText);
    if (structuredMcq) return structuredMcq;

    return null;
  }

  static detectInlineMCQ(text) {
    // Matches patterns like: "What is 2+2? (A) 3 (B) 4 (C) 5 (D) 6"
    const inlinePattern = /[\(\[]?([a-dA-D1-4i-vI-V])[\)\]\.\-]\s*([^()\[\]\n]+?)(?=\s*[\(\[]?[a-dA-D1-4i-vI-V][\)\]\.\-]\s*|$)/g;
    const matches = [...text.matchAll(inlinePattern)];
    
    if (matches.length >= 4) {
      const options = [];
      const labelMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'i': 'A', 'ii': 'B', 'iii': 'C', 'iv': 'D' };
      const labels = ['A', 'B', 'C', 'D'];
      
      for (let i = 0; i < Math.min(4, matches.length); i++) {
        const rawLabel = matches[i][1].toUpperCase();
        let label = labelMap[rawLabel] || labels[i] || 'A';
        options.push({
          label: label,
          text: matches[i][2].trim()
        });
      }
      
      if (options.length >= 4) {
        const firstOptionIndex = text.indexOf(matches[0][0]);
        const questionText = firstOptionIndex > 0 ? text.substring(0, firstOptionIndex).trim() : '';
        
        return {
          question: questionText || 'Question',
          options: options,
          format: 'inline'
        };
      }
    }

    return null;
  }

  static detectLineBasedMCQ(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let firstOptionIndex = -1;
    const options = [];
    const labelMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'i': 'A', 'ii': 'B', 'iii': 'C', 'iv': 'D', 'I': 'A', 'II': 'B', 'III': 'C', 'IV': 'D' };
    const labels = ['A', 'B', 'C', 'D'];
    let currentOption = null;

    // More flexible option regex: handles (A), A., a), A:, etc.
    const optionRegex = /^[\(\[]?([a-dA-D1-4i-vI-V]+)[\)\]\.:\-\s]+(.+)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(optionRegex);
      
      if (match) {
        if (firstOptionIndex === -1) {
          firstOptionIndex = i;
        }

        const rawLabel = match[1].toLowerCase();
        let label = labelMap[rawLabel] || labels[options.length] || 'A';
        
        currentOption = {
          label,
          text: match[2].trim()
        };
        options.push(currentOption);
      } else if (currentOption && line.length > 0) {
        // Multi-line option support: append to previous option if line doesn't start with option label
        if (!line.match(/^[\(\[]?[a-dA-D1-4i-vI-V]+[\)\]\.:\-]/)) {
          currentOption.text += ' ' + line;
        }
      }
    }

    if (options.length >= 2) {
      const questionText = lines.slice(0, firstOptionIndex).join('\n').trim();
      
      // Pad to 4 options if needed
      while (options.length < 4) {
        options.push({
          label: labels[options.length],
          text: ''
        });
      }
      
      return {
        question: questionText || 'Question',
        options: options.slice(0, 4),
        format: 'line-based',
        optionCount: options.length
      };
    }

    return null;
  }

  static detectStructuredMCQ(text) {
    // Try to detect structured formats with clear delimiters
    const structuredPatterns = [
      /question\s*[:\-]?\s*(.+?)\s*(?:options?|choice|answer)\s*[:\-]?\s*(.*)/is,
      /(\d+\.\s+.+?)\s*(?:option|choice)\s*a\s*[:\-]?\s*(.+?)(?=option|choice|$)/is,
    ];

    for (const pattern of structuredPatterns) {
      const match = text.match(pattern);
      if (match) {
        const questionText = match[1].trim();
        const optionsText = match[2].trim();
        
        // Parse options from the options text
        const optionLines = optionsText.split(/\n/).filter(l => l.trim().length > 0);
        const options = [];
        const labelMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'i': 'A', 'ii': 'B', 'iii': 'C', 'iv': 'D' };
        const labels = ['A', 'B', 'C', 'D'];

        for (const line of optionLines) {
          const optionMatch = line.match(/^[\(\[]?([a-dA-D1-4i-vI-V]+)[\)\]\.:\-\s]+(.+)$/);
          if (optionMatch) {
            const rawLabel = optionMatch[1].toLowerCase();
            const label = labelMap[rawLabel] || labels[options.length] || 'A';
            options.push({
              label,
              text: optionMatch[2].trim()
            });
          }
        }

        if (options.length >= 2) {
          while (options.length < 4) {
            options.push({
              label: labels[options.length],
              text: ''
            });
          }

          return {
            question: questionText,
            options: options.slice(0, 4),
            format: 'structured'
          };
        }
      }
    }

    return null;
  }
}

// 4. LATEX SANITIZER SERVICE with Command Whitelisting
class LatexSanitizer {
  // Whitelist of safe LaTeX commands for mathematics
  static SAFE_COMMANDS = new Set([
    // Basic math
    'frac', 'dfrac', 'tfrac', 'genfrac',
    'sqrt', 'sqrt[3]', 'sqrt[4]', 'nthroot',
    'sum', 'prod', 'int', 'iint', 'iiint', 'oint',
    'limit', 'lim', 'limsup', 'liminf',
    
    // Logic & sets
    'forall', 'exists', 'in', 'notin', 'subset', 'supset', 'cup', 'cap',
    'mathbb', 'mathcal', 'mathfrak', 'mathbf', 'mathrm', 'mathit', 'mathtt',
    'emptyset', 'mathbb{R}', 'mathbb{Z}', 'mathbb{Q}', 'mathbb{N}', 'mathbb{C}',
    
    // Operators
    'pm', 'mp', 'times', 'div', 'cdot', 'ast', 'circ', 'bullet', 'star',
    'le', 'ge', 'ne', 'approx', 'equiv', 'sim', 'simeq', 'cong',
    'parallel', 'perp', 'angle', 'triangle',
    
    // Arrows
    'rightarrow', 'leftarrow', 'leftrightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow',
    'to', 'mapsto', 'uparrow', 'downarrow',
    
    // Calculus
    'partial', 'nabla', 'infty', 'prime', 'dot', 'ddot', 'dagger',
    
    // Greek letters
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
    'upsilon', 'phi', 'chi', 'psi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
    
    // Environments
    'begin', 'end', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Bmatrix', 'smallmatrix',
    'array', 'align', 'align*', 'equation', 'equation*', 'gather', 'gather*',
    'multline', 'multline*', 'split', 'alignat', 'alignat*', 'cases', 'flalign', 'flalign*',
    
    // Text & styling
    'text', 'textit', 'textbf', 'texttt', 'textcal', 'textsl', 'textfrak',
    'overline', 'underline', 'overrightarrow', 'overleftarrow', 'overbrace', 'underbrace',
    'overarc', 'underarc', 'overset', 'underset',
    
    // Brackets
    'left', 'right', 'bigg', 'Big', 'big', 'bigl', 'bigr', 'biggl', 'biggr',
  ]);

  static sanitize(latex) {
    if (!latex) return '';

    let sanitized = latex;

    // 1. Convert display block math to standardized KaTeX delimiters
    sanitized = sanitized.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
    sanitized = sanitized.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

    // 2. Fix common OCR mistakes in mathematical notation
    sanitized = sanitized.replace(/\\\s+/g, '\\'); // Remove spaces after backslashes
    sanitized = sanitized.replace(/}\s*\\left/g, '}\\left'); // Fix bracket spacing
    sanitized = sanitized.replace(/\\right\s*{/g, '\\right{'); // Fix right bracket
    sanitized = sanitized.replace(/\$\s+/g, '$'); // Remove spaces inside delimiters
    
    // 3. Remove dangerous/unsupported commands
    const dangerousCommands = [
      'input', 'write', 'immediate', 'openout', 'closeout',
      'special', 'usepackage', 'documentclass', 'def', 'let',
      'catcode', 'mathcodes', 'edef', 'xdef', 'expandafter'
    ];
    for (const cmd of dangerousCommands) {
      const regex = new RegExp(`\\\\${cmd}\\s*{[^}]*}`, 'g');
      sanitized = sanitized.replace(regex, '');
    }

    // 4. Balance unclosed math structures & environments
    const environments = ['matrix', 'pmatrix', 'bmatrix', 'align', 'cases', 'array', 'vmatrix', 'equation'];
    for (const env of environments) {
      const beginCount = (sanitized.match(new RegExp(`\\\\begin{${env}}`, 'g')) || []).length;
      const endCount = (sanitized.match(new RegExp(`\\\\end{${env}}`, 'g')) || []).length;
      if (beginCount > endCount) {
        for (let i = 0; i < beginCount - endCount; i++) {
          sanitized += ` \\end{${env}}`;
        }
      }
    }

    // 5. Auto-balance braces
    let openBraces = 0;
    let closeBraces = 0;
    for (let i = 0; i < sanitized.length; i++) {
      if (sanitized[i] === '{' && (i === 0 || sanitized[i - 1] !== '\\')) openBraces++;
      else if (sanitized[i] === '}' && (i === 0 || sanitized[i - 1] !== '\\')) closeBraces++;
    }
    if (openBraces > closeBraces) {
      sanitized += '}'.repeat(Math.min(openBraces - closeBraces, 10));
    }

    // 6. Auto-balance square brackets
    let openSquare = 0;
    let closeSquare = 0;
    for (let i = 0; i < sanitized.length; i++) {
      if (sanitized[i] === '[' && (i === 0 || sanitized[i - 1] !== '\\')) openSquare++;
      else if (sanitized[i] === ']' && (i === 0 || sanitized[i - 1] !== '\\')) closeSquare++;
    }
    if (openSquare > closeSquare) {
      sanitized += ']'.repeat(Math.min(openSquare - closeSquare, 10));
    }

    // 7. Balance inline dollar signs
    let dollarCount = 0;
    for (let i = 0; i < sanitized.length; i++) {
      if (sanitized[i] === '$' && (i === 0 || sanitized[i - 1] !== '\\')) {
        dollarCount++;
      }
    }
    if (dollarCount % 2 !== 0) {
      sanitized += '$';
    }

    // 8. Clean up common OCR artifacts
    sanitized = sanitized.replace(/\\Big\s*\(/g, '\\Big(');
    sanitized = sanitized.replace(/\\Big\s*\)/g, '\\Big)');
    sanitized = sanitized.replace(/\\text\s*{(.*?)}/g, (match, p1) => p1);
    sanitized = sanitized.replace(/\\,/g, ' '); // Remove thin spaces
    sanitized = sanitized.replace(/\\:/g, ' '); // Remove medium spaces
    sanitized = sanitized.replace(/\\;/g, ' '); // Remove thick spaces
    sanitized = sanitized.replace(/~~+/g, ''); // Remove tildes

    // 9. Fix common fraction/power OCR errors
    sanitized = sanitized.replace(/\^(\d)([a-zA-Z])/g, '^{$1}$2'); // ^2x -> ^{2}x
    sanitized = sanitized.replace(/_(\d)([a-zA-Z])/g, '_{$1}$2'); // _1x -> _{1}x

    // 10. Final cleanup - remove consecutive spaces and newlines inside math
    sanitized = sanitized.replace(/\$\s+/g, '$');
    sanitized = sanitized.replace(/\s+\$/g, '$');

    return sanitized.trim();
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
