const { OCRNormalizer } = require('./ocrNormalizer');

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

class QuestionSegmenter {
  static _isQuestionHeader(line) {
    if (!line) return null;

    const trimmed = line.trim();
    
    // Strict question header patterns:
    // 1. "Question 12:" or "Q.12 -" or "No. 12"
    // 2. "Question 12 of 20"
    // 3. "12. Evaluate ..." or "12) Evaluate ..." (number followed by delimiter and meaningful text)
    const headerPatterns = [
      /^(?:Question|Q|No\.?)\s*[:\-]?\s*(\d+)\s*(.+)$/i,
      /^Question\s*(\d+)\s*[:\-]?\s*of\s*\d+\s*(.+)?$/i,
      /^([0-9]{1,3})[\.)\-:]\s+(\S.+)$/,
    ];

    for (const pattern of headerPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        // Defensive: Ensure we don't treat option labels as question headers
        const isOption = /^[\(\[]?[A-Da-d1-4ivxIVX]{1,4}[\)\]\.]\s+/.test(trimmed);
        if (isOption) {
          // If it matches an option pattern (like A. or B. or i.), verify it's not a false positive
          // e.g. "1. " is a question, but "A. " or "i. " might be an option.
          // But a pure number "1. " won't start with A-D or roman i. So we are safe.
          // Let's filter out if the matched prefix itself is an option pattern.
          if (/^[A-Da-d]\./.test(trimmed) || /^[a-d]\)/.test(trimmed)) {
            continue;
          }
        }
        return {
          number: match[1],
          text: (match[2] || '').trim(),
        };
      }
    }

    return null;
  }

  /**
   * Segments text into individual question blocks.
   * @param {string} text
   */
  static segment(text) {
    if (!text) return [];
    
    // Normalize text first using OCRNormalizer
    const normalized = OCRNormalizer.normalizeText(text);
    const mathRanges = getMathRanges(normalized);
    const lines = normalized.split('\n');
    const segments = [];
    let current = null;
    let cursor = 0;

    const flushCurrent = (endIndex) => {
      if (!current) return;
      const segmentText = current.lines.join('\n').trim();
      if (segmentText) {
        segments.push({
          text: segmentText,
          number: current.number,
          startIndex: current.startIndex,
          endIndex,
          rawHeader: current.rawHeader,
        });
      }
      current = null;
    };

    for (const line of lines) {
      const lineStart = cursor;
      cursor += line.length + 1;

      // Skip lines inside multi-line LaTeX blocks
      const withinMath = mathRanges.some(r => lineStart >= r.start && lineStart < r.end);
      if (withinMath) {
        if (current) current.lines.push(line);
        continue;
      }

      const header = QuestionSegmenter._isQuestionHeader(line);

      if (header) {
        const hasQuestionBody = current && current.lines.some(existingLine => existingLine.trim().length > 0);
        const hasOptionContent = current && current.lines.some(existingLine => /^\s*\(?[A-Da-d1-4ivxIVX]{1,4}[\)\.]\s+/.test(existingLine.trim()));
        
        // Start a new segment if we don't have a current one, or if the current one already has body or option content
        if (!current || hasQuestionBody || hasOptionContent) {
          flushCurrent(lineStart - 1);
          current = {
            number: header.number,
            rawHeader: line.trim(),
            startIndex: lineStart,
            lines: [line],
          };
          continue;
        }
      }

      if (!current) {
        current = {
          number: null,
          rawHeader: '',
          startIndex: lineStart,
          lines: [line],
        };
      } else {
        current.lines.push(line);
      }
    }

    flushCurrent(normalized.length);

    if (segments.length === 0) {
      return [{ text: normalized, number: null, startIndex: 0, endIndex: normalized.length, rawHeader: '' }];
    }

    return segments;
  }
}

module.exports = { QuestionSegmenter };
