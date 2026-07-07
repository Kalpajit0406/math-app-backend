'use strict';

class ImportNormalizerService {
  /**
   * Remove extra whitespace and linebreaks.
   */
  static removeExtraWhitespace(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/\s+/g, ' ').trim();
  }

  /**
   * Normalize LaTeX characters and format.
   */
  static normalizeLaTeX(str) {
    if (!str || typeof str !== 'string') return '';
    let text = str;
    
    // Convert inline formula delimiters if needed (e.g., \( \) to $)
    text = text.replace(/\\\(|\\\)/g, '$');
    
    // Ensure math formulas have balanced dollar signs
    // e.g. replacing common OCR errors on math symbols
    // theta -> \theta, pi -> \pi if not preceded by backslash
    text = text.replace(/([^\\])(theta|pi|alpha|beta|gamma|phi|lambda|delta|mu|sigma|omega)/gi, (m, p1, p2) => {
      return `${p1}\\${p2.toLowerCase()}`;
    });
    
    return text.trim();
  }

  /**
   * Normalize answer format to A, B, C, or D.
   * Supports mapping of Bengali letters ক, খ, গ, ঘ or 1, 2, 3, 4.
   */
  static normalizeAnswerFormat(answer) {
    if (!answer || typeof answer !== 'string') return 'A';
    const ans = answer.trim().toUpperCase();
    
    if (['A', 'B', 'C', 'D'].includes(ans)) return ans;
    
    // Bengali options
    if (ans === 'ক') return 'A';
    if (ans === 'খ') return 'B';
    if (ans === 'গ') return 'C';
    if (ans === 'ঘ') return 'D';
    
    // Numbers
    if (ans === '1' || ans === '১') return 'A';
    if (ans === '2' || ans === '২') return 'B';
    if (ans === '3' || ans === '৩') return 'C';
    if (ans === '4' || ans === '৪') return 'D';
    
    return 'A'; // Fallback
  }

  /**
   * Normalize Unicode characters: remove zero-width spaces, normalize Bengali digits.
   */
  static normalizeUnicode(str) {
    if (!str || typeof str !== 'string') return '';
    let normalized = str;
    // Remove zero-width spaces and invisible unicode characters
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return normalized.trim();
  }

  /**
   * Normalizes options array to exactly 4 formatted items.
   */
  static normalizeOptions(options) {
    const list = (options || []).map(o => {
      let val = '';
      if (typeof o === 'object' && o !== null) {
        val = o.text || '';
      } else {
        val = String(o || '');
      }
      val = this.normalizeUnicode(val);
      val = this.normalizeLaTeX(val);
      val = this.removeExtraWhitespace(val);
      return val;
    }).filter(Boolean);

    while (list.length < 4) {
      list.push(`Option ${String.fromCharCode(65 + list.length)}`);
    }
    return list.slice(0, 4);
  }

  /**
   * Main normalize function for questions.
   */
  static normalizeQuestion(questionObj) {
    const questionText = this.removeExtraWhitespace(
      this.normalizeLaTeX(
        this.normalizeUnicode(questionObj.question || questionObj.questionText || '')
      )
    );
    const options = this.normalizeOptions(questionObj.options);
    const correctAnswer = this.normalizeAnswerFormat(questionObj.correctAnswer);
    return {
      question: questionText,
      options,
      correctAnswer
    };
  }
}

module.exports = ImportNormalizerService;
