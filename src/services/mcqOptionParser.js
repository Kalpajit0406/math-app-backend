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
    // Also handles Bengali question headers like "প্রশ্ন 3" or "প্র. 3"
    const internalHeaderPattern = /\n\s*(?:Question\s+\d+|Q\s*\d+|Q\d+|\d+\.|প্রশ্ন\s*[\d০-৯]+|প্র\.\s*[\d০-৯]+)\s+/;
    const internalHeader = segmentText.match(internalHeaderPattern);
    if (internalHeader && internalHeader.index != null) {
      segmentText = segmentText.substring(0, internalHeader.index).trim();
    }

    const lines = segmentText.split('\n').map(l => l.replace(/\r/g, '').trim());
    
    // Pattern matches options starting with:
    //  - Latin:   (A), A., [A], A), 1., (1) etc.
    //  - Bengali option labels: ক., (ক), ক), খ., গ., ঘ.
    //  - Bengali numerals: ১., ২., ৩., ৪. (mapped via bengaliToEnglishDigits)
    const optionStartRegex = /^\s*[\(\[]?\s*([A-Da-d1-4কখগঘ১২৩৪]|i{1,4}|I{1,4})\s*[\)\]\.]\s*(.*)$/;
    
    const romanMap = { i: 0, ii: 1, iii: 2, iv: 3, v: 3, vi: 3 };
    const numericMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    const alphaMap = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };
    // Bengali option labels (ক=A, খ=B, গ=C, ঘ=D) and Bengali numerals as option markers
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
      return null; // Not enough options to qualify as an MCQ
    }

    // Normalize options array to have exactly 4 entries (A, B, C, D)
    const normalizedOptions = [];
    const targetLabels = ['A', 'B', 'C', 'D'];
    
    for (let i = 0; i < 4; i++) {
      const matched = options.find(opt => opt.label === targetLabels[i]);
      if (matched) {
        normalizedOptions.push({ label: targetLabels[i], text: matched.text });
      } else {
        // If not found in parsed options, check if we can grab from index
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
