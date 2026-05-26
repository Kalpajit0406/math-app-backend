const { OCRNormalizer } = require('./ocrNormalizer');

// Converts Bengali Unicode digits (০-৯) to their ASCII equivalents
function bengaliToEnglishDigits(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, (ch) => String(ch.codePointAt(0) - 0x09E6));
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

class QuestionSegmenter {
  static _isQuestionHeader(line) {
    if (!line) return null;

    // Normalise Bengali digits before matching
    const trimmed = bengaliToEnglishDigits(line.trim());
    
    // Strict question header patterns:
    // 1. "Question 12:" or "Q.12 -" or "No. 12"
    // 2. "Question 12 of 20"
    // 3. "12. Evaluate ..." or "12) Evaluate ..." (number followed by delimiter and meaningful text)
    // 4. Bengali: "প্রশ্ন 12" or "প্র. 12" (Bengali prefix with English/Bengali digits)
    const headerPatterns = [
      /^(?:Question|Q|No\.?|প্রশ্ন|প্র\.?)\s*[:\-]?\s*(\d+)\s*(.+)$/i,
      /^Question\s*(\d+)\s*[:\-]?\s*of\s*\d+\s*(.+)?$/i,
      /^([0-9]{1,3})[\.)\-:]\s+(\S.+)$/,
    ];

    for (const pattern of headerPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        // Defensive: Ensure we don't treat option labels as question headers
        const isOption = /^[\(\[]?[A-Da-d1-4ivxIVX\u0995-\u0998]{1,4}[\)\]\.]\s+/.test(trimmed);
        if (isOption) {
          // Filter out Bengali option labels (ক, খ, গ, ঘ) and latin option prefixes
          if (/^[A-Da-d]\./.test(trimmed) || /^[a-d]\)/.test(trimmed) ||
              /^[কখগঘ][\.)\]]/.test(line.trim())) {
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

    // ── PASS 1: LOOKAHEAD PRE-SPLIT ──────────────────────────────────────────
    // Split at any position where a question number header starts, even if
    // it appears mid-line (e.g. after a closing "$" in Mathpix inline output).
    //
    // Pattern breakdown:
    //   (?<![\d])      lookbehind: NOT preceded by a digit
    //                  (prevents splitting INSIDE "11." at position 1)
    //   (?=            lookahead (zero-width – keeps delimiter in next chunk)
    //     \n?\s*       optional newline + whitespace
    //     \d{1,3}      1–3 digit question number
    //     [\.\)\-:]    followed by . ) - or :
    //     \s+          at least one space (distinguishes "12. Q..." from "12.5")
    //     (?!\d)       NOT another digit (avoids splitting on decimal numbers)
    //   )
    const lookaheadPattern = /(?<![\d])(?=\n?\s*\d{1,3}[\.\)\-:]\s+(?!\d))/;
    const rawBlocks = normalized.split(lookaheadPattern);

    // ── PASS 2: LINE-BY-LINE HEADER EXTRACTION PER BLOCK ────────────────────
    const segments = [];

    for (const block of rawBlocks) {
      if (!block.trim()) continue;

      const mathRanges = getMathRanges(block);
      const lines = block.split('\n');
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

      flushCurrent(block.length);
    }

    if (segments.length === 0) {
      return [{ text: normalized, number: null, startIndex: 0, endIndex: normalized.length, rawHeader: '' }];
    }

    return segments;
  }
}

module.exports = { QuestionSegmenter };
