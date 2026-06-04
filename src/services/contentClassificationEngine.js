/**
 * ContentClassificationEngine Service
 * Classifies blocks of OCR output and ignores page boundaries, headers, footers, publisher branding,
 * and decorative assets before they corrupt the question/option parser.
 */

const ClassificationTypes = {
  QUESTION: 'QUESTION',
  OPTION: 'OPTION',
  HEADER: 'HEADER',
  FOOTER: 'FOOTER',
  PAGE_NUMBER: 'PAGE_NUMBER',
  ANSWER_KEY: 'ANSWER_KEY',
  SECTION_TITLE: 'SECTION_TITLE',
  DECORATION: 'DECORATION',
  PUBLISHER_BRANDING: 'PUBLISHER_BRANDING',
  NON_QUESTION_CONTENT: 'NON_QUESTION_CONTENT'
};

class ContentClassificationEngine {
  /**
   * Classifies a single line of OCR text.
   * @param {string} line - A single line of text
   * @returns {string} The ClassificationType
   */
  static classifyLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      return ClassificationTypes.NON_QUESTION_CONTENT;
    }

    // 1. Decoration / Banners / Decorative strips (e.g. ---, ***, ===, ____)
    if (/^[\s\-\*\=_~#\+\|\\\/]{3,}$/.test(trimmed)) {
      return ClassificationTypes.DECORATION;
    }

    // 2. Page Numbers (e.g. "Page 12", "12 of 20", or a single number if it matches page format)
    // Avoid classifying single numeric options like "1." as page numbers by checking for trailing letters/spaces
    if (/^(?:page|pg\.?)\s*\d+\s*$/i.test(trimmed) || /^\d+\s*of\s*\d+\s*$/i.test(trimmed)) {
      return ClassificationTypes.PAGE_NUMBER;
    }

    // 3. Publisher Branding
    // e.g. "CHHAYA MATHEMATICS", "CHHAYA", "HS CORNER", or other branding strings
    const brandingPatterns = [
      /chhaya\s+mathematics/i,
      /\bchhaya\b/i,
      /hs\s+corner/i,
      /publisher/i,
      /publication/i
    ];
    if (brandingPatterns.some(pat => pat.test(trimmed))) {
      return ClassificationTypes.PUBLISHER_BRANDING;
    }

    // 4. Section Titles / Exercise Names
    // e.g. "EXERCISE 8", "EXERCISE 8.2", "EXERCISE", "CHAPTER 2"
    if (/^(?:exercise|ex\.?)\s*\d*(?:\.\d+)*\s*$/i.test(trimmed) || /^(?:chapter|ch\.?)\s*\d+\s*$/i.test(trimmed)) {
      return ClassificationTypes.SECTION_TITLE;
    }

    // LaTeX heading commands (e.g. \section*{EXERCISE}, \subsection{Conventional Type})
    if (/^\\(?:chapter|section|subsection|subsubsection)\*?\{.*\}\s*$/i.test(trimmed)) {
      return ClassificationTypes.SECTION_TITLE;
    }

    // 5. Answer sections / Answer keys
    // e.g. "ANSWERS", "ANSWER SECTION", "ANSWER KEY"
    if (/^answers?\s*(?:key|section)?\s*$/i.test(trimmed)) {
      return ClassificationTypes.ANSWER_KEY;
    }

    // 6. Header / Footer / Metadata Labels
    // e.g. "Mark 1", "Level 1", "Class XI", "Semester-I", "Unit-1"
    const metadataPatterns = [
      /^(?:marks?|val)\s*[:\-]?\s*\d+\s*$/i,
      /^(?:exe\s+)?level\s*(?:[ivx]+|\d+)\s*$/i,
      /^class\s+(?:IX|X|XI|XII|\d+)\s*$/i,
      /^semester\s*[\-\s]?\s*(?:I|II|III|IV|V|VI|\d+)\s*$/i,
      /^unit\s*[\-\s]?\s*(?:I|II|III|IV|V|VI|\d+)\s*$/i
    ];
    if (metadataPatterns.some(pat => pat.test(trimmed))) {
      return ClassificationTypes.HEADER;
    }

    // 7. Option Labels (e.g. (A), A., ক., ১.)
    // Avoid classifying these as noise, keep them classified as OPTION
    const optionStartRegex = /^\s*[\(\[]?\s*(?:[A-Da-d1-4কখগঘ১২৩৪]|i{1,4}|I{1,4})\s*[\)\]\.]\s*(.*)$/;
    if (optionStartRegex.test(trimmed)) {
      return ClassificationTypes.OPTION;
    }

    // 8. Question Headers (e.g. Question 1, Q1, 1.)
    const questionHeaderRegex = /^(?:Question|Q|No\.?|প্রশ্ন|প্র\.?)\s*[:\-]?\s*(\d+)/i;
    if (questionHeaderRegex.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed)) {
      return ClassificationTypes.QUESTION;
    }

    // By default, if the line does not trigger ignore patterns, classify it as QUESTION
    // to preserve all math text and body content.
    return ClassificationTypes.QUESTION;
  }

  /**
   * Filters out metadata and noise lines from raw OCR output.
   * @param {string} text - Raw OCR or sanitized text
   * @returns {string} Filtered text
   */
  static filterNoise(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const filteredLines = [];

    const noiseTypes = [
      ClassificationTypes.DECORATION,
      ClassificationTypes.PAGE_NUMBER,
      ClassificationTypes.PUBLISHER_BRANDING,
      ClassificationTypes.SECTION_TITLE,
      ClassificationTypes.ANSWER_KEY,
      ClassificationTypes.HEADER,
      ClassificationTypes.FOOTER
    ];

    for (const line of lines) {
      const type = this.classifyLine(line);
      if (noiseTypes.includes(type)) {
        console.log(`[ContentClassifier] Ignored line [${type}]: "${line.trim()}"`);
        continue;
      }
      filteredLines.push(line);
    }

    return filteredLines.join('\n');
  }

  /**
   * Strictly detects answer key pages/grids
   * @param {string} text - The page text
   * @returns {boolean}
   */
  static isAnswerKeyPage(text) {
    if (!text) return false;
    const normalized = text.toLowerCase();
    
    // Explicit keywords
    const explicitHeadingRegex = /(?:answer\s*key|answers|answer\s*sheet|উত্তরমালা|উত্তর|সংক্ষিপ্ত\s*উত্তরমালা|conventional\s*type\s*answers?|correct\s*options?|key\s*answers?)/i;
    if (explicitHeadingRegex.test(normalized)) {
      return true;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return false;

    let answerPatternCount = 0;
    // Match line that contains ONLY simple answers like:
    // "1. (A)" or "5. B" or "6. (C)" or "7. খ"
    // or multiple inline like "1. (A) 2. (B) 3. (C)"
    const singleAnswerRegex = /^\d{1,3}\s*[\.\-\):\s]\s*\(?[A-DABCDকখগঘ১২৩৪i-ivI-IV]\)?\s*$/i;
    const multipleAnswersRegex = /^(?:\d{1,3}\s*[\.\-\):\s]\s*\(?[A-DABCDকখগঘ১২৩৪i-ivI-IV]\)?(?:\s+|$)){2,}$/i;

    for (const line of lines) {
      if (singleAnswerRegex.test(line) || multipleAnswersRegex.test(line)) {
        answerPatternCount++;
      }
    }

    const ratio = answerPatternCount / lines.length;
    // If more than 20% of lines are answers, or we have 4 or more answer patterns
    if (ratio > 0.20 || answerPatternCount >= 4) {
      return true;
    }

    return false;
  }
}

module.exports = {
  ContentClassificationEngine,
  ClassificationTypes
};
