const { OCRNormalizer } = require('./ocrNormalizer');
const { ContentClassificationEngine } = require('./contentClassificationEngine');

// Converts Bengali Unicode digits (০-৯) to their ASCII equivalents
function bengaliToEnglishDigits(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, (ch) => String(ch.codePointAt(0) - 0x09E6));
}

// Helper for finding math ranges to preserve LaTeX blocks
function getMathRanges(text) {
  const ranges = [];
  if (!text) return ranges;
  const mathRegex = /\$\$.*?\$\$|\\\[.*?\\\]|\\\(.*?\\\)|(?<!\$)\$.*?\$(?!\$)/gs;
  let match;
  while ((match = mathRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

class QuestionSegmenter {
  static _isQuestionHeader(line, current = null) {
    if (!line) return null;

    // Normalise Bengali digits before matching
    const trimmed = bengaliToEnglishDigits(line.trim());
    
    // Strict question header patterns:
    // 1. "Question 12:" or "Q.12 -" or "No. 12"
    // 2. "Question 12 of 20"
    // 3. "12. Evaluate ..." or "12) Evaluate ..." (number followed by delimiter and meaningful text)
    // 4. Bengali: "প্রশ্ন 12" or "প্র. 12" (Bengali prefix with English/Bengali digits)
    const headerPatterns = [
      /^(?:Question|Q\.?|No\.?|প্রশ্ন|প্র\.?)\s*[\.:]?\s*(\d+)\s*(.+)$/i,
      /^Question\s*(\d+)\s*[\.:]?\s*of\s*\d+\s*(.+)?$/i,
      /^([0-9]{1,3})[\.)\:]\s+(\S.+)$/,
    ];

    for (const pattern of headerPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const numStr = match[1];
        const num = parseInt(numStr, 10);
        
        // Defensive: Check if it's an option label instead of a question header
        const isOption = /^[\(\[]?(?:[A-Da-d1-4কখগঘ১২৩৪]|i{1,4}|I{1,4})[\)\]\.\:]\s*/.test(trimmed);
        if (isOption) {
          // If it is a letter option (A-D, ক-ঘ), it is ALWAYS an option, never a question
          if (/^[A-Da-dকখগঘ][\.\)\]]/i.test(trimmed.replace(/^[\(\[]/, ''))) {
            continue;
          }
          // If it is a number or Roman option:
          // Check if it is the successor of the current question number.
          if (current && current.number) {
            const currentNum = parseInt(current.number, 10);
            if (!isNaN(currentNum) && num === currentNum + 1) {
              // Successor question: treat as question header
              return {
                number: numStr,
                text: (match[2] || '').trim(),
              };
            }
            // If current exists but is not the successor, treat as option (skip)
            continue;
          }
        }
        return {
          number: numStr,
          text: (match[2] || '').trim(),
        };
      }
    }

    return null;
  }

  /**
   * Segments text into individual question blocks.
   * 
   * Uses a two-pass approach:
   *  Pass 1 (Lookahead Split): Split the text wherever a question number
   *          boundary appears, even inline (e.g. "...answer$12. Next...").
   *          This mirrors the reference backend (mmdHandling.ts line 424).
   *  Pass 2 (Line-by-line): Process each pre-split block with the existing
   *          header detector for numbering and structure extraction.
   *
   * @param {string} text
   */
  static segment(text) {
    if (!text) return [];

    // Normalize text first using OCRNormalizer
    const normalized = OCRNormalizer.normalizeText(text);

    // Filter out page numbers, brandings, metadata headers, levels, etc.
    const filteredText = ContentClassificationEngine.filterNoise(normalized);

    // ── PASS 1: LOOKAHEAD PRE-SPLIT ──────────────────────────────────────────
    // Split at any position where a question number header starts, even if
    // it appears mid-line (e.g. after a closing "$" in Mathpix inline output).
    const lookaheadPattern = /(?:\n|[.?!]\s+|(?<=\$))(?=(?:(?:\b(?:Question|No\.)\s+|\bQ\.?\s*|(?:প্রশ্ন|প্র\.?)\s*)\d{1,3}[\.\)\:]?\s+|\d{1,3}[\.\)\:]\s+)(?!\d))/gi;
    const rawBlocks = filteredText.split(lookaheadPattern);

    // ── PASS 2: LINE-BY-LINE HEADER EXTRACTION PER BLOCK ────────────────────
    const segments = [];
    let current = null;

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

    for (const block of rawBlocks) {
      if (!block.trim()) continue;

      const mathRanges = getMathRanges(block);
      const lines = block.split('\n');
      let cursor = 0;

      for (const line of lines) {
        const lineStart = cursor;
        cursor += line.length + 1;

        // Skip lines inside multi-line LaTeX blocks
        const withinMath = mathRanges.some(r => lineStart >= r.start && lineStart < r.end);
        if (withinMath) {
          if (current) current.lines.push(line);
          continue;
        }

        const header = QuestionSegmenter._isQuestionHeader(line, current);

        if (header) {
          const hasQuestionBody = current && current.lines.some(l => l.trim().length > 0);
          const hasOptionContent = current && current.lines.some(l =>
            /^\s*\(?[A-Da-d1-4ivxIVX]{1,4}[\)\.\s]+/.test(l.trim())
          );

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
    }

    if (current) {
      flushCurrent(filteredText.length);
    }

    if (segments.length === 0) {
      return [{ text: filteredText, number: null, startIndex: 0, endIndex: filteredText.length, rawHeader: '' }];
    }

    return segments;
  }
}

module.exports = { QuestionSegmenter };
