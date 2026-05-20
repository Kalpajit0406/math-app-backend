/**
 * OCRNormalizer
 * - Performs whitespace, delimiter, unicode, and line-break normalization on OCR output
 * - Repairs common OCR artifacts that break segmentation
 */
class OCRNormalizer {
  /**
   * Normalize OCR text to make segmentation and parsing more reliable
   * @param {string} text
   */
  static normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    let s = text;

    // Normalize line endings
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Replace non-breaking spaces and other unicode spaces with ordinary space
    s = s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');

    // Normalize multiple spaces and tabs to single space
    s = s.replace(/[ \t]+/g, ' ');

    // Collapse multiple blank lines to a single blank line
    s = s.replace(/\n{3,}/g, '\n\n');

    // Repair broken numbering like "11 . Question" -> "11. Question"
    s = s.replace(/(?<=^|\n)\s*(\d+)\s*[\.\)]\s*/g, (m, p1) => `${p1}. `);

    // Fix common OCR duplicated punctuation
    s = s.replace(/\.\.+/g, '.');
    s = s.replace(/\,\,\,+/g, ',');

    // Remove stray control characters
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // Merge broken lines that are likely to be part of the same sentence/question
    // If a line does not end with terminal punctuation and next line starts lowercase or math symbol, join
    s = s.split('\n').reduce((acc, line, idx, arr) => {
      if (idx === 0) return [line];
      const prev = acc[acc.length - 1];
      const trimmedLine = line.trim();
      const startsQuestionHeader = /^(?:Question\s+\d+|Q\s*\d+|Q\d+|\d+\.)\s*/.test(trimmedLine);
      const startsOptionLabel = /^[\(\[]?(?:[A-Da-d]|[1-4]|i{1,4}|I{1,4})[\)\]\.\:]\s+/.test(trimmedLine);

      if (
        prev &&
        !startsQuestionHeader &&
        !startsOptionLabel &&
        !/[\.\?\!:\;\)]$/.test(prev.trim()) &&
        /^[a-z0-9\\\(\$\[]/.test(trimmedLine)
      ) {
        acc[acc.length - 1] = `${prev} ${trimmedLine}`;
      } else {
        acc.push(line);
      }
      return acc;
    }, []).join('\n');

    return s.trim();
  }
}

module.exports = { OCRNormalizer };
