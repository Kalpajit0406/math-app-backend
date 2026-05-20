const { MathpixService } = require('./mathpixService');
const { ImagePreprocessor } = require('./imagePreprocessor');

// ─── 0. QUESTION NUMBER EXTRACTOR ──────────────────────────────────────────
class QuestionNumberExtractor {
  /**
   * Extract question number from text start
   * Handles: "1.", "11.", "Q1.", "Question 1", "(1)", "i.", "1)"
   */
  static extract(text) {
    if (!text) return null;
    const trimmed = text.trim();
    
    const numberPatterns = [
      /^(?:Question|Q|No\.?)\s*[:\-]?\s*(\d+)/i,           // Question 1, Q1, No.1
      /^Question\s*(\d+)\s*[:\-]?\s*of\s*\d+/i,            // Question 1 of 10
      /^\(([ivxldmcIVXLDMC0-9]+)\)\s/,                       // (1) or (i)
      /^([ivxldmcIVXLDMC0-9]+)[\.\)\-\:]\s+(?!\w+[\.\)])/,   // 1., i), 1-
      /^([0-9]+)\s*$/,                                       // Just number
    ];

    for (const pattern of numberPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return { raw: match[1], full: match[0] };
      }
    }
    return null;
  }
}

// Helper for finding math ranges to preserve LaTeX blocks
function getMathRanges(text) {
  const ranges = [];
  if (!text) return ranges;
  
  // Find $$ ... $$
  const displayMathRegex = /\$\$.*?\$\$/gs;
  let match;
  while ((match = displayMathRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  
  // Find \[ ... \]
  const bracketMathRegex = /\\\[.*?\\\]/gs;
  while ((match = bracketMathRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  
  // Find \( ... \)
  const parenMathRegex = /\\\(.*?\\\)/gs;
  while ((match = parenMathRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  
  // Find $ ... $ (avoiding double dollar matches)
  const inlineMathRegex = /(?<!\$)\$.*?\$(?!\$)/gs;
  while ((match = inlineMathRegex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    const isOverlapping = ranges.some(r => (start >= r.start && start < r.end) || (end > r.start && end <= r.end));
    if (!isOverlapping) {
      ranges.push({ start, end });
    }
  }
  
  return ranges;
}

class MCQOptionParser {
  static parse(segmentText) {
    if (!segmentText) return null;

    // Defensive: truncate if a subsequent question header exists inside
    const internalHeader = segmentText.match(/\n\s*(?:Question\s+\d+|Q\s*\d+|Q\d+|\d+\.)\s+/);
    if (internalHeader && internalHeader.index != null) {
      segmentText = segmentText.substring(0, internalHeader.index).trim();
    }

    const lines = segmentText.split('\n').map(l => l.replace(/\r/g, '').trim());
    const optionStartRegex = /^\s*[\(\[]?\s*([A-Da-d1-4]|i{1,4}|I{1,4})\s*[\)\]\.]\s*(.*)$/;
    const romanMap = { i: 0, ii: 1, iii: 2, iv: 3, v: 3 };
    const numericMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    const alphaMap = { A:0, B:1, C:2, D:3, a:0, b:1, c:2, d:3 };

    let questionLines = [];
    const options = [];
    let currentOption = null;
    let foundFirstOptionAt = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(optionStartRegex);
      if (m) {
        foundFirstOptionAt = foundFirstOptionAt === -1 ? i : foundFirstOptionAt;
        const rawLabel = m[1];
        const rest = m[2] || '';
        let idx = null;
        if (alphaMap.hasOwnProperty(rawLabel)) idx = alphaMap[rawLabel];
        else if (numericMap.hasOwnProperty(rawLabel)) idx = numericMap[rawLabel];
        else if (romanMap.hasOwnProperty(rawLabel.toLowerCase())) idx = romanMap[rawLabel.toLowerCase()];
        else idx = options.length;

        currentOption = { label: ['A','B','C','D'][idx] || 'A', text: rest.trim() };
        options.push(currentOption);
      } else if (currentOption) {
        // continuation of previous option (multiline option)
        currentOption.text += '\n' + line;
      } else {
        questionLines.push(line);
      }
    }

    if (options.length < 2) return null;

    // Normalize options array to have 4 entries
    while (options.length < 4) options.push({ label: ['A','B','C','D'][options.length], text: '' });

    const questionText = questionLines.slice(0, foundFirstOptionAt === -1 ? questionLines.length : foundFirstOptionAt).join(' ').trim() || 'Question';

    return {
      question: questionText,
      options: options.slice(0,4),
      format: 'line-based'
    };
  }

  static _findBestChain(matches) {
    // fallback retained for compatibility but not used by line-based parser
    let maxWeight = 0;
    let bestChain = [];
    function search(currentIndex, lastValueIndex, currentChain, currentWeight) {
      if (currentWeight > maxWeight) { maxWeight = currentWeight; bestChain = [...currentChain]; }
      for (let i = currentIndex; i < matches.length; i++) {
        const match = matches[i];
        if (match.valueIndex > lastValueIndex) {
          currentChain.push(match);
          search(i + 1, match.valueIndex, currentChain, currentWeight + match.weight);
          currentChain.pop();
        }
      }
    }
    search(0, -1, [], 0);
    return bestChain;
  }
}

// ─── 1. MCQ DETECTOR (enhanced for multi-question) ───────────────────────────
class MCQDetector {
  static splitMultipleQuestions(text) {
    if (!text) return [];
    
    const segments = QuestionSegmenter.segment(text);
    return segments.map((seg, idx) => ({
      text: seg.text,
      number: seg.number || (idx + 1).toString(),
      numberPattern: seg.rawHeader || ''
    }));
  }

  static detectMultiple(text, rawText = null) {
    const chunks = this.splitMultipleQuestions(text);
    const results = [];
    
    console.log(`[MCQDetector.detectMultiple] Processing ${chunks.length} segments.`);
    
    for (const chunk of chunks) {
      if (!chunk.text || !chunk.text.trim()) continue;
      
      const parsed = this.detect(chunk.text);
      if (parsed) {
        results.push({
          ...parsed,
          questionNumber: chunk.number,
          rawChunk: chunk.text,
          ocrConfidence: null
        });
      } else {
        console.log(`[MCQDetector] Segment for Q# ${chunk.number} parsed as descriptive/fallback.`);
        results.push({
          question: chunk.text,
          options: [
            {label: 'A', text: ''}, 
            {label: 'B', text: ''}, 
            {label: 'C', text: ''}, 
            {label: 'D', text: ''}
          ],
          format: 'descriptive',
          questionNumber: chunk.number,
          rawChunk: chunk.text,
          ocrConfidence: null
        });
      }
    }
    return results;
  }

  static detect(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.trim();
    
    const parsed = MCQOptionParser.parse(cleaned);
    if (parsed) return parsed;
    
    // Legacy support fallback
    const cleanedLegacy = cleaned.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    return (
      this.detectStructuredMCQ(cleanedLegacy) ||
      this.detectLineBasedMCQ(cleanedLegacy) ||
      this.detectInlineMCQ(cleanedLegacy) ||
      null
    );
  }

  static detectInlineMCQ(text) {
    const labelRegex = /(?:^|\n|\s)[\(\[]?([A-Da-d1-4]|i{1,3}|iv|v|I{1,3}|IV|V)[\)\]\.\:](?=\s)/g;
    const parts = text.split(labelRegex);
    if (parts.length >= 9) {
      const labels = ['A', 'B', 'C', 'D'];
      const labelMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'i': 'A', 'ii': 'B', 'iii': 'C', 'iv': 'D' };
      const options = [];
      for (let i = 1; i <= 8; i += 2) {
        if (i < parts.length) {
          const rawLabel = parts[i].toLowerCase();
          const optText = parts[i + 1]?.trim() || '';
          options.push({
            label: labelMap[rawLabel] || labels[Math.floor(i/2)],
            text: optText
          });
        }
      }
      if (options.length === 4 && options.some(o => o.text.length > 0)) {
        return { 
          question: (parts[0]?.trim() || 'Question').substring(0, 500),
          options: options, 
          format: 'inline' 
        };
      }
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
        let labelStr = labelMap[rawLabel];
        if (!labelStr) {
          if (rawLabel === 'iv') labelStr = 'D';
          else if (rawLabel.length === 3 && rawLabel[0] === rawLabel[1]) labelStr = ['A', 'B', 'C', 'D'][rawLabel.length - 1];
          else labelStr = labels[options.length] || 'A';
        }
        currentOption = {
          label: labelStr,
          text: match[2].trim(),
        };
        options.push(currentOption);
      } else if (currentOption && firstOptionIndex >= 0) {
        currentOption.text += '\n' + lines[i];
      }
    }

    if (options.length >= 2) {
      const questionText = firstOptionIndex > 0 ? lines.slice(0, firstOptionIndex).join('\n').trim() : 'Question';
      while (options.length < 4) options.push({ label: labels[options.length], text: '' });
      return { 
        question: questionText || 'Question',
        options: options.slice(0, 4),
        format: 'line-based',
        optionCount: Math.min(options.length, 4)
      };
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

// ─── 2. LATEX SANITIZER (improved per-question handling) ─────────────────────
class LatexSanitizer {
  /**
   * Sanitize entire LaTeX block
   */
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

    // Balance braces and dollar signs (assign returned corrected text)
    s = this._balanceBraces(s);
    s = this._balanceDollarSigns(s);

    // Normalize common OCR symbol mistakes to LaTeX-safe tokens
    const symbolMap = {
      '−': '-', // unicode minus
      '×': '\\times',
      '÷': '\\div',
      '·': '\\cdot',
      '—': '-',
      '–': '-'
    };
    s = s.replace(/[−×÷·—–]/g, ch => symbolMap[ch] || ch);

    // Repair simple frac patterns where OCR may drop braces: frac a b -> \frac{a}{b}
    s = s.replace(/\\?frac\s*\{?\s*([^\s{}]+)\s*\}?\s*\{?\s*([^\s{}]+)\s*\}?/g, '\\frac{$1}{$2}');

    // Remove duplicated operators like ++ or -- introduced by OCR
    s = s.replace(/([+\-\/\^=])\1+/g, '$1');

    // Balance parentheses and square brackets
    s = this._balanceBrackets(s);

    // Fix common OCR fraction/power errors
    s = s.replace(/\^(\d)([a-zA-Z])/g, '^{$1}$2');
    s = s.replace(/_(\d)([a-zA-Z])/g, '_{$1}$2');

    return s.trim();
  }

  /**
   * Balance braces in text
   */
  static _balanceBraces(s) {
    let opens = 0, closes = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '{' && s[i - 1] !== '\\') opens++;
      else if (s[i] === '}' && s[i - 1] !== '\\') closes++;
    }
    if (opens > closes) return s + '}'.repeat(Math.min(opens - closes, 10));
    return s;
  }

  static _balanceBrackets(s) {
    let openPar = 0, closePar = 0, openSq = 0, closeSq = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(' && s[i - 1] !== '\\') openPar++;
      else if (s[i] === ')' && s[i - 1] !== '\\') closePar++;
      else if (s[i] === '[' && s[i - 1] !== '\\') openSq++;
      else if (s[i] === ']' && s[i - 1] !== '\\') closeSq++;
    }
    if (openPar > closePar) s = s + ')'.repeat(Math.min(openPar - closePar, 10));
    if (openSq > closeSq) s = s + ']'.repeat(Math.min(openSq - closeSq, 10));
    return s;
  }

  /**
   * Balance dollar signs (inline math delimiters)
   */
  static _balanceDollarSigns(s) {
    let dollars = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '$' && s[i - 1] !== '\\') dollars++;
    }
    if (dollars % 2 !== 0) return s + '$';
    return s;
  }

  /**
   * Extract and preserve LaTeX for a specific question chunk
   */
  static extractChunkLatex(latex, chunk) {
    if (!latex || !chunk) return chunk;
    
    // Find the position of this chunk in the full text
    // This is a simplified approach - returns the whole latex for now
    // In production, could do more sophisticated matching
    return latex;
  }
}

// ─── 3. QUESTION QUEUE MANAGER ────────────────────────────────────────────────
/**
 * Manages temporary storage of extracted questions during verification workflow
 */
class QuestionQueueManager {
  constructor() {
    this.queues = new Map(); // userId -> { items: [], createdAt, expiresAt }
  }

  /**
   * Store extracted questions for a user session
   * @param {string} sessionId - Unique session ID
   * @param {Array} questions - Array of parsed question objects
   * @param {number} ttlSeconds - Time to live in seconds (default 3600 = 1 hour)
   */
  storeQuestions(sessionId, questions, ttlSeconds = 3600) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.queues.set(sessionId, {
      items: questions,
      createdAt: Date.now(),
      expiresAt: expiresAt,
      currentIndex: 0
    });
    return { sessionId, count: questions.length, expiresAt };
  }

  /**
   * Get current question from queue
   */
  getCurrentQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue || this._isExpired(queue)) {
      this.queues.delete(sessionId);
      return null;
    }
    return queue.items[queue.currentIndex] || null;
  }

  /**
   * Get all questions in queue
   */
  getQueueItems(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue || this._isExpired(queue)) {
      this.queues.delete(sessionId);
      return [];
    }
    return queue.items;
  }

  /**
   * Move to next question
   */
  nextQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) return null;
    queue.currentIndex++;
    if (queue.currentIndex >= queue.items.length) {
      this.queues.delete(sessionId);
      return null;
    }
    return queue.items[queue.currentIndex];
  }

  /**
   * Move to previous question
   */
  prevQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) return null;
    if (queue.currentIndex > 0) {
      queue.currentIndex--;
    }
    return queue.items[queue.currentIndex];
  }

  /**
   * Get queue status
   */
  getStatus(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) return null;
    return {
      total: queue.items.length,
      currentIndex: queue.currentIndex,
      currentNumber: queue.currentIndex + 1,
      hasNext: queue.currentIndex < queue.items.length - 1,
      hasPrev: queue.currentIndex > 0,
      expiresIn: Math.max(0, Math.round((queue.expiresAt - Date.now()) / 1000))
    };
  }

  /**
   * Remove question from queue
   */
  removeQuestion(sessionId, index) {
    const queue = this.queues.get(sessionId);
    if (!queue) return false;
    queue.items.splice(index, 1);
    if (queue.currentIndex >= queue.items.length && queue.currentIndex > 0) {
      queue.currentIndex--;
    }
    return true;
  }

  /**
   * Clear queue
   */
  clearQueue(sessionId) {
    this.queues.delete(sessionId);
  }

  /**
   * Check if queue is expired
   */
  _isExpired(queue) {
    return Date.now() > queue.expiresAt;
  }

  /**
   * Clean up expired queues periodically
   */
  cleanup() {
    const now = Date.now();
    for (const [sessionId, queue] of this.queues.entries()) {
      if (now > queue.expiresAt) {
        this.queues.delete(sessionId);
      }
    }
  }
}

// ─── 4. OCR RESULT VALIDATOR ──────────────────────────────────────────────────
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

// ─── 5. UNIFIED OCR PIPELINE ─────────────────────────────────────────────────
class OCRPipeline {
  /**
   * Run the full OCR pipeline on a raw image buffer.
   * Enhanced with raw data preservation and multi-question detection.
   * @param {Buffer} buffer   - Raw image bytes from multer
   * @param {string} mimetype - MIME type (e.g. 'image/jpeg')
   * @param {string} filename - Original filename
   */
  static async runFromBuffer(buffer, mimetype, filename) {
    // Step 0: Preprocess image buffer to improve OCR quality and detect issues
    let preprocessInfo = null;
    try {
      preprocessInfo = await ImagePreprocessor.preprocessBuffer(buffer);
      buffer = preprocessInfo.buffer;
    } catch (err) {
      console.warn('[OCRPipeline] Image preprocessing failed, proceeding with original buffer:', err.message);
    }

    // Step 1: Call Mathpix with FormData multipart upload
    const mathpixResult = await MathpixService.processBuffer(buffer, mimetype, filename);
    const { rawText, latex: rawLatex, confidence } = mathpixResult;

    // Step 2: Sanitize LaTeX
    const sanitizedLatex = LatexSanitizer.sanitize(rawLatex);

    // Step 3: Detect MCQ structure for potentially multiple questions
    // Try LaTeX first (higher quality), then fallback to raw text
    let parsedQuestions = MCQDetector.detectMultiple(sanitizedLatex);
    let sourceUsed = 'latex';
    
    if (!parsedQuestions || parsedQuestions.length === 0) {
      const fallback = MCQDetector.detectMultiple(rawText);
      if (fallback && fallback.length > 0) {
        parsedQuestions = fallback;
        sourceUsed = 'rawText';
      }
    }

    // Step 4: Enrich each question with raw OCR data
    const enrichedQuestions = (parsedQuestions || []).map((q, idx) => ({
      ...q,
      // Preserve raw OCR data for debugging/recovery
      rawOcrData: {
        sourceUsed,
        rawText: rawText,
        rawLatex: rawLatex,
        sanitizedLatex: sanitizedLatex,
        confidence: confidence,
        chunkText: q.rawChunk || '',
        preprocessing: preprocessInfo ? preprocessInfo.diagnostics : null,
        preprocessingQuality: preprocessInfo ? preprocessInfo.qualityRating : null
      },
      // Store OCR confidence at question level
      ocrConfidence: confidence,
      // Tracking
      detectionOrder: idx + 1,
      verified: false
    }));

    // Step 5: Validate quality
    const validation = OCRResultValidator.validate(rawText, sanitizedLatex, confidence);

    console.log('[OCRPipeline] Complete:', {
      rawTextLength: rawText?.length || 0,
      latexLength: sanitizedLatex?.length || 0,
      questionsDetected: enrichedQuestions.length,
      sourceUsed,
      confidence: validation.confidence,
      qualityRating: validation.rating,
    });

    return {
      rawText: rawText || '',
      latex: sanitizedLatex,
      parsedQuestions: enrichedQuestions,
      confidence: validation.confidence,
      qualityRating: validation.rating,
      isValid: validation.isValid,
      detectionQuality: {
        source: sourceUsed,
        multipleDetected: enrichedQuestions.length > 1,
        questionCount: enrichedQuestions.length,
      }
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
  QuestionNumberExtractor,
  MCQDetector,
  LatexSanitizer,
  QuestionQueueManager,
  OCRResultValidator,
  OCRPipeline,
};
