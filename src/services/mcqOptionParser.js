/**
 * MCQOptionParser Service
 * Parses options strictly within the boundaries of an isolated question segment.
 * Ensures options do not leak across question blocks and formats options to exactly 4 choices.
 */

// Converts Bengali Unicode digits (০-৯) to ASCII equivalents
function bengaliToEnglishDigits(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, (ch) => String(ch.codePointAt(0) - 0x09E6));
}

class MCQOptionParser {
  /**
   * Parse MCQ options from an isolated question segment text.
   * @param {string} segmentText - The raw text of a single question segment
   * @returns {object|null} Object containing question body, options array, and format, or null if not a valid MCQ
   */
  static parse(segmentText) {
    if (!segmentText) return null;

    // Defensive check: if there is a subsequent question header leaked inside, truncate it.
    // Matches Question X or Q X or digits >= 5 / multi-digits followed by dot, and Bengali counterparts.
    const internalHeaderPattern = /\n\s*(?:Question\s+\d+|Q\s*\d+|Q\d+|(?:(?:[5-9]|\d{2,})|(?:[৫-৯]|[০-৯]{2,}))\.|প্রশ্ন\s*[\d০-৯]+|প্র\.\s*[\d০-৯]+)\s+/;
    const internalHeader = segmentText.match(internalHeaderPattern);
    if (internalHeader && internalHeader.index != null) {
      segmentText = segmentText.substring(0, internalHeader.index).trim();
    }

    // Try structured layout first
    const structured = this.detectStructured(segmentText);
    if (structured) return structured;

    // Try inline layout
    const inline = this.detectInline(segmentText);
    if (inline) return inline;

    // Try line-by-line layout
    const lineBased = this.detectLineBased(segmentText);
    if (lineBased) return lineBased;

    return null;
  }

  /**
   * Detect structured options key-value style
   */
  static detectStructured(text) {
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
          // Support Bengali option labels in structured format
          const om = line.match(/^[\(\[]?([A-Da-d1-4কখগঘ১২৩৪]|i{1,3}|iv|v|I{1,3}|IV|V)[\)\]\.\:\-\s]+(.+)$/);
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

  /**
   * Parse inline options (e.g. A. option B. option or ক. option খ. option)
   */
  static detectInline(text) {
    // 1. Mathpix specific inline options: (A) option (B) option...
    const inlineOptionPattern = /(?<![A-Za-z0-9\\])\(([ABCDabcdকখগঘ১২৩৪])\)\s*([\s\S]*?)(?=\s*(?<![A-Za-z0-9\\])\([ABCDabcdকখগঘ১২৩৪]\)|$)/g;
    const inlineSingleLine = text.replace(/\n+/g, ' '); // flatten to one line for matching
    const inlineMatches = [...inlineSingleLine.matchAll(inlineOptionPattern)];

    if (inlineMatches.length >= 3) {
      const labelMap = {
        A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3,
        'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3,
        '১': 0, '২': 1, '৩': 2, '৪': 3
      };
      const inlineOptions = [
        { label: 'A', text: '' },
        { label: 'B', text: '' },
        { label: 'C', text: '' },
        { label: 'D', text: '' },
      ];

      for (const match of inlineMatches) {
        const rawLabel = match[1];
        const idx = labelMap[rawLabel];
        if (idx !== undefined) {
          inlineOptions[idx].text = match[2].trim().replace(/\s+/g, ' ');
        }
      }

      // Reconstruct question body
      const standaloneOptionRegex = /(?<![A-Za-z0-9\\])\([ABCDabcdকখগঘ১২৩৪]\)/;
      const firstStandaloneMatch = standaloneOptionRegex.exec(inlineSingleLine);
      const firstOptionStart = firstStandaloneMatch ? firstStandaloneMatch.index : -1;
      const inlineQuestionText = firstOptionStart > 0
        ? inlineSingleLine.substring(0, firstOptionStart).replace(/^\d+[\.\)]\s*/, '').trim()
        : 'Question Text';

      const filledOptions = inlineOptions.filter(o => o.text.trim().length > 0);
      if (filledOptions.length >= 2) {
        return {
          question: inlineQuestionText || 'Question Text',
          options: inlineOptions,
          format: 'inline-mcq',
        };
      }
    }

    // 2. Generic label splitting fallback (Bengali & Roman numerals)
    const labelRegex = /(?:^|\n|\s)[\(\[]?([A-Da-d1-4কখগঘ১২৩৪]|i{1,3}|iv|v|I{1,3}|IV|V)[\)\]\.\:](?=\s)/g;
    const parts = text.split(labelRegex);
    if (parts.length >= 9) {
      const labels = ['A', 'B', 'C', 'D'];
      const labelMap = {
        '1': 'A', '2': 'B', '3': 'C', '4': 'D',
        'i': 'A', 'ii': 'B', 'iii': 'C', 'iv': 'D',
        'ক': 'A', 'খ': 'B', 'গ': 'C', 'ঘ': 'D',
        '১': 'A', '২': 'B', '৩': 'C', '৪': 'D',
      };
      const options = [];
      for (let i = 1; i <= 8; i += 2) {
        if (i < parts.length) {
          const rawLabel = parts[i].toLowerCase();
          const optText = parts[i + 1]?.trim() || '';
          options.push({
            label: labelMap[rawLabel] || labelMap[parts[i]] || labels[Math.floor(i/2)],
            text: optText
          });
        }
      }
      if (options.length === 4 && options.some(o => o.text.length > 0)) {
        return { 
          question: (parts[0]?.trim() || 'Question').substring(0, 500),
          options: options, 
          format: 'inline-mcq' 
        };
      }
    }

    return null;
  }

  /**
   * Detect option patterns line-by-line (Latin and Bengali)
   */
  static detectLineBased(text) {
    const lines = text.split('\n').map(l => l.replace(/\r/g, '').trim());
    const optionStartRegex = /^\s*[\(\[]?\s*([A-Da-d1-4কখগঘ১২৩৪]|i{1,4}|I{1,4})\s*[\)\]\.]\s*(.*)$/;
    
    const romanMap = { i: 0, ii: 1, iii: 2, iv: 3, v: 3, vi: 3 };
    const numericMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    const alphaMap = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };
    const bengaliLabelMap = { 'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3, '১': 0, '২': 1, '৩': 2, '৪': 3 };

    let questionLines = [];
    const options = [];
    let currentOption = null;
    let foundFirstOptionAt = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const m = line.match(optionStartRegex);
      if (m) {
        foundFirstOptionAt = foundFirstOptionAt === -1 ? i : foundFirstOptionAt;
        const rawLabel = m[1];
        const rest = m[2] || '';
        
        let idx = null;
        if (alphaMap.hasOwnProperty(rawLabel)) {
          idx = alphaMap[rawLabel];
        } else if (numericMap.hasOwnProperty(rawLabel)) {
          idx = numericMap[rawLabel];
        } else if (bengaliLabelMap.hasOwnProperty(rawLabel)) {
          idx = bengaliLabelMap[rawLabel];
        } else if (romanMap.hasOwnProperty(rawLabel.toLowerCase())) {
          idx = romanMap[rawLabel.toLowerCase()];
        } else {
          idx = options.length;
        }

        const label = ['A', 'B', 'C', 'D'][idx] || ['A', 'B', 'C', 'D'][options.length] || 'A';
        currentOption = { label, text: rest.trim() };
        options.push(currentOption);
      } else if (currentOption) {
        // Continuation of a multiline option
        currentOption.text += '\n' + line;
      } else {
        questionLines.push(line);
      }
    }

    if (options.length < 2) {
      return null; // Not enough options
    }

    // Normalize options array to have exactly 4 entries (A, B, C, D)
    const normalizedOptions = [];
    const targetLabels = ['A', 'B', 'C', 'D'];
    
    for (let i = 0; i < 4; i++) {
      const matched = options.find(opt => opt.label === targetLabels[i]);
      if (matched) {
        normalizedOptions.push({ label: targetLabels[i], text: matched.text });
      } else {
        if (options[i]) {
          normalizedOptions.push({ label: targetLabels[i], text: options[i].text });
        } else {
          normalizedOptions.push({ label: targetLabels[i], text: '' });
        }
      }
    }

    // Reconstruct the question body from lines preceding the first option
    const questionText = questionLines
      .slice(0, foundFirstOptionAt === -1 ? questionLines.length : foundFirstOptionAt)
      .join('\n')
      .trim();

    return {
      question: questionText || 'Question Text',
      options: normalizedOptions,
      format: 'line-based'
    };
  }
}

module.exports = { MCQOptionParser };
