/**
 * MCQOptionParser Service
 * Parses options strictly within the boundaries of an isolated question segment.
 * Ensures options do not leak across question blocks and formats options to exactly 4 choices.
 */
class MCQOptionParser {
  /**
   * Parse MCQ options from an isolated question segment text.
   * @param {string} segmentText - The raw text of a single question segment
   * @returns {object|null} Object containing question body, options array, and format, or null if not a valid MCQ
   */
  static parse(segmentText) {
    if (!segmentText) return null;

    // Defensive check: if there is a subsequent question header leaked inside, truncate it.
    // (Although QuestionSegmenter should prevent this, we add it as an extra safety layer.)
    const internalHeader = segmentText.match(/\n\s*(?:Question\s+\d+|Q\s*\d+|Q\d+|\d+\.)\s+/);
    if (internalHeader && internalHeader.index != null) {
      segmentText = segmentText.substring(0, internalHeader.index).trim();
    }

    const lines = segmentText.split('\n').map(l => l.replace(/\r/g, '').trim());
    
    // Pattern matches options starting with (A), A., [A], A), etc.
    const optionStartRegex = /^\s*[\(\[]?\s*([A-Da-d1-4]|i{1,4}|I{1,4})\s*[\)\]\.]\s*(.*)$/;
    
    const romanMap = { i: 0, ii: 1, iii: 2, iv: 3, v: 3, vi: 3 };
    const numericMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    const alphaMap = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };

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
