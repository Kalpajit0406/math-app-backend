const { MathpixService } = require('./mathpixService');

// ─── 1. MCQ DETECTOR (ported from reference mmdHandling.ts) ─────────────────
class MCQDetector {
  static splitMultipleQuestions(text) {
    if (!text) return [];
    
    // Split on lines that look like a new question starting.
    // e.g. "1. " or "11." or "Q1." or "Question 12:" or "(1)"
    const splitRegex = /^(?:[Qq]uestion\s*\d+|[Qq]\d+|\(\d+\)|\d+)[\.\)\-\:]?(?=\s+\S)/gm;
    
    const matches = [...text.matchAll(splitRegex)];
    if (matches.length <= 1) {
      return [text];
    }

    const chunks = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      let chunk = text.substring(start, end).trim();
      
      // If there's text before the first match, prepend it to the first chunk
      if (i === 0 && start > 0) {
        const preamble = text.substring(0, start).trim();
        if (preamble) {
          chunk = preamble + '\n\n' + chunk;
        }
      }
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  static detectMultiple(text) {
    const chunks = this.splitMultipleQuestions(text);
    const results = [];
    
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const parsed = this.detect(chunk);
      if (parsed) {
        results.push(parsed);
      } else {
        // No options found, treat as descriptive question
        results.push({
          question: chunk,
          options: [
            {label: 'A', text: ''}, 
            {label: 'B', text: ''}, 
            {label: 'C', text: ''}, 
            {label: 'D', text: ''}
          ],
          format: 'descriptive'
        });
      }
    }
    return results;
  }

  static detect(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

    return (
      this.detectStructuredMCQ(cleaned) ||
      this.detectLineBasedMCQ(cleaned) ||
      this.detectInlineMCQ(cleaned) ||
      null
    );
  }

  static detectInlineMCQ(text) {
    // Robust inline label splitting. Matches (A), (B), (C), (D) or A., B., C., D.
    // It avoids stopping at regular parentheses by splitting using the label boundaries
    const labelRegex = /(?:^|\s)[\(\[]?([A-Da-d1-4]|i{1,3}|iv|v|I{1,3}|IV|V)[\)\]\.\:](?=\s)/g;
    const parts = text.split(labelRegex);
    
    // parts will be: [ preamble, label1, text1, label2, text2, ... ]
    if (parts.length >= 9) { // At least 4 options (1 + 4*2)
      const labels = ['A', 'B', 'C', 'D'];
      const labelMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'i': 'A', 'ii': 'B', 'iii': 'C', 'iv': 'D' };
      const options = [];
      
      for (let i = 1; i <= 8; i += 2) {
        const rawLabel = parts[i].toLowerCase();
        options.push({
          label: labelMap[rawLabel] || labels[Math.floor(i/2)],
          text: parts[i+1].trim()
        });
      }
      
      return { 
        question: parts[0].trim() || 'Question', 
        options: options, 
        format: 'inline' 
      };
    }
    return null;
  }

  static detectLineBasedMCQ(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const optionRegex = /^[\(\[]?([A-Da-d1-4]|i{1,3}|iv|v|I{1,3}|IV|V)[\)\]\.\:\-\s]+(.+)$/;
    const labelMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', i: 'A', ii: 'B', iii: 'C', iv: 'D', I: 'A', II: 'B', III: 'C', IV: 'D' };
    const labels = ['A', 'B', 'C', 'D'];
    const options = [];
    let firstOptionIndex = -1;
    let currentOption = null;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(optionRegex);
      if (match) {
        if (firstOptionIndex === -1) firstOptionIndex = i;
        const rawLabel = match[1].toLowerCase();
        currentOption = {
          label: labelMap[rawLabel] || labels[options.length] || 'A',
          text: match[2].trim(),
        };
        options.push(currentOption);
      } else if (currentOption) {
        currentOption.text += '\n' + lines[i];
      }
    }

    if (options.length >= 2) {
      const questionText = lines.slice(0, firstOptionIndex).join('\n').trim();
      while (options.length < 4) options.push({ label: labels[options.length], text: '' });
      return { question: questionText || 'Question', options: options.slice(0, 4), format: 'line-based' };
    }
    return null;
  }

  static detectStructuredMCQ(text) {
    const patterns = [
      /question\s*[:\-]?\s*(.+?)\s*(?:options?|choice|answer)\s*[:\-]?\s*(.*)/is,
      /(\d+\.\s+.+?)\s*option\s*a\s*[:\-]?\s*(.+?)(?=option|choice|$)/is,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const optLines = match[2].trim().split(/\n/).filter(l => l.trim());
        const opts = [];
        const labels = ['A', 'B', 'C', 'D'];
        for (const line of optLines) {
          const om = line.match(/^[\(\[]?([A-Da-d1-4]|i{1,3}|iv|v|I{1,3}|IV|V)[\)\]\.\:\-\s]+(.+)$/);
          if (om) opts.push({ label: labels[opts.length] || 'A', text: om[2].trim() });
        }
        if (opts.length >= 2) {
          while (opts.length < 4) opts.push({ label: labels[opts.length], text: '' });
          return { question: match[1].trim(), options: opts.slice(0, 4), format: 'structured' };
        }
      }
    }
    return null;
  }
}

// ─── 2. LATEX SANITIZER ───────────────────────────────────────────────────────
class LatexSanitizer {
  static sanitize(latex) {
    if (!latex) return '';
    let s = latex;

    // Convert display block math delimiters
    s = s.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
    s = s.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

    // Remove OCR spacing artifacts
    s = s.replace(/\\\s+/g, '\\');
    s = s.replace(/}\s*\\left/g, '}\\left');
    s = s.replace(/\$\s+/g, '$');
    s = s.replace(/\s+\$/g, '$');

    // Remove dangerous LaTeX commands
    const dangerous = ['input', 'write', 'immediate', 'openout', 'closeout', 'special',
      'usepackage', 'documentclass', 'def', 'let', 'catcode', 'edef', 'xdef', 'expandafter'];
    for (const cmd of dangerous) {
      s = s.replace(new RegExp(`\\\\${cmd}\\s*{[^}]*}`, 'g'), '');
    }

    // Balance environments
    for (const env of ['matrix', 'pmatrix', 'bmatrix', 'align', 'cases', 'array', 'equation']) {
      const opens = (s.match(new RegExp(`\\\\begin{${env}}`, 'g')) || []).length;
      const closes = (s.match(new RegExp(`\\\\end{${env}}`, 'g')) || []).length;
      if (opens > closes) s += ` \\end{${env}}`.repeat(opens - closes);
    }

    // Balance braces and dollar signs
    let opens = 0, closes = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '{' && s[i - 1] !== '\\') opens++;
      else if (s[i] === '}' && s[i - 1] !== '\\') closes++;
    }
    if (opens > closes) s += '}'.repeat(Math.min(opens - closes, 10));

    let dollars = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '$' && s[i - 1] !== '\\') dollars++;
    }
    if (dollars % 2 !== 0) s += '$';

    // Fix common OCR fraction/power errors
    s = s.replace(/\^(\d)([a-zA-Z])/g, '^{$1}$2');
    s = s.replace(/_(\d)([a-zA-Z])/g, '_{$1}$2');

    return s.trim();
  }
}

// ─── 3. OCR RESULT VALIDATOR ─────────────────────────────────────────────────
class OCRResultValidator {
  static validate(rawText, latex, confidence) {
    const conf = confidence != null ? confidence : 1.0;
    let rating = 'high';
    if (conf < 0.6) rating = 'low';
    else if (conf < 0.85) rating = 'medium';

    const isValid = (rawText && rawText.trim().length > 0) || (latex && latex.trim().length > 0);
    return { confidence: conf, rating, isValid: !!isValid };
  }
}

// ─── 4. UNIFIED OCR PIPELINE ─────────────────────────────────────────────────
class OCRPipeline {
  /**
   * Run the full OCR pipeline on a raw image buffer.
   * @param {Buffer} buffer   - Raw image bytes from multer
   * @param {string} mimetype - MIME type (e.g. 'image/jpeg')
   * @param {string} filename - Original filename
   */
  static async runFromBuffer(buffer, mimetype, filename) {
    // Step 1: Call Mathpix with FormData multipart upload
    const mathpixResult = await MathpixService.processBuffer(buffer, mimetype, filename);

    const { rawText, latex: rawLatex, confidence } = mathpixResult;

    // Step 2: Sanitize LaTeX
    const sanitizedLatex = LatexSanitizer.sanitize(rawLatex);

    // Step 3: Detect MCQ structure for potentially multiple questions
    let parsedQuestions = MCQDetector.detectMultiple(sanitizedLatex);
    
    // If latex parsing yielded no questions or only one descriptive, try falling back to raw text
    if (!parsedQuestions || parsedQuestions.length === 0 || (parsedQuestions.length === 1 && parsedQuestions[0].format === 'descriptive')) {
      const fallback = MCQDetector.detectMultiple(rawText);
      if (fallback && fallback.length > 0 && fallback[0].format !== 'descriptive') {
        parsedQuestions = fallback;
      }
    }

    // Step 4: Validate quality
    const validation = OCRResultValidator.validate(rawText, sanitizedLatex, confidence);

    console.log('[OCRPipeline] Complete:', {
      rawTextLength: rawText?.length || 0,
      latexLength: sanitizedLatex?.length || 0,
      questionsDetected: parsedQuestions.length,
      confidence: validation.confidence,
      qualityRating: validation.rating,
    });

    return {
      rawText: rawText || '',
      latex: sanitizedLatex,
      parsedQuestions, // Replaces parsedMcq
      confidence: validation.confidence,
      qualityRating: validation.rating,
      isValid: validation.isValid,
    };
  }

  /**
   * Legacy compatibility: run from base64 data URI or URL.
   * Converts to buffer then calls runFromBuffer.
   * @param {string} src - base64 data URI or http URL
   */
  static async run(src) {
    let buffer;
    let mimetype = 'image/jpeg';
    let filename = 'image.jpg';

    if (src.startsWith('data:')) {
      const [meta, b64] = src.split(',');
      const mimeMatch = meta.match(/data:([^;]+);/);
      if (mimeMatch) mimetype = mimeMatch[1];
      buffer = Buffer.from(b64, 'base64');
    } else if (src.startsWith('http')) {
      const fetchModule = await import('node-fetch');
      const fetch = fetchModule.default;
      const resp = await fetch(src);
      buffer = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get('content-type');
      if (ct) mimetype = ct.split(';')[0].trim();
    } else {
      buffer = Buffer.from(src, 'base64');
    }

    return this.runFromBuffer(buffer, mimetype, filename);
  }
}

module.exports = {
  MCQDetector,
  LatexSanitizer,
  OCRResultValidator,
  OCRPipeline,
};
