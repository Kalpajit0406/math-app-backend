'use strict';

class GeminiResponseParser {
  /**
   * Safely parses JSON response from Gemini, removing any markdown formatting wrappers if present.
   * @param {string} textRaw - Raw response string from Gemini API
   * @returns {object[]} Array of parsed question objects
   */
  static parse(textRaw) {
    if (!textRaw || typeof textRaw !== 'string') {
      throw new Error('Gemini returned an empty or invalid response.');
    }

    let cleanText = textRaw.trim();

    // 1. Remove markdown json code block markers
    if (cleanText.includes('```')) {
      // Find the first ```json or ``` and the last ```
      const startIdx = cleanText.indexOf('```');
      const endIdx = cleanText.lastIndexOf('```');
      if (startIdx !== -1 && endIdx !== -1 && startIdx !== endIdx) {
        let inside = cleanText.substring(startIdx, endIdx);
        // Remove the starting ```json or ```
        inside = inside.replace(/^```(?:json)?\s*/i, '');
        cleanText = inside.trim();
      }
    }

    // 2. Locate first [ and last ] to extract JSON array
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleanText = cleanText.substring(firstBracket, lastBracket + 1);
    }

    try {
      const parsed = JSON.parse(cleanText);
      if (!Array.isArray(parsed)) {
        throw new Error('Parsed Gemini output is not a JSON array.');
      }
      return parsed;
    } catch (err) {
      console.error('[GeminiResponseParser] JSON parse failed. Raw text snippet:', textRaw.substring(0, 500));
      throw new Error(`Failed to parse Gemini output as structured JSON: ${err.message}`);
    }
  }
}

module.exports = { GeminiResponseParser };
