/**
 * QuestionDuplicateDetector — Smart MCQ Duplicate Detection Service
 * Detects duplicates using question sentence similarity only (ignoring options, answer, etc.)
 * Meets all low-latency and 512MB RAM constraints.
 */

'use strict';

const crypto = require('crypto');
const Question = require('../models/questionModel');

/**
 * Clean and normalize a question text string.
 */
function normalizeQuestion(questionText) {
  if (!questionText || typeof questionText !== 'string') return '';

  let normalized = questionText.toLowerCase();

  // 1. Remove zero-width spaces and invisible unicode characters
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 2. Normalize Bengali digits to English digits temporarily for uniformity
  normalized = normalized.replace(/[০-৯]/g, (ch) => String(ch.codePointAt(0) - 0x09E6));

  // 3. Remove question numbering prefixes
  // e.g. "Question 12:", "Q12.", "No. 12", "12) ", "12. "
  normalized = normalized
    .replace(/^(?:question|q\.?|no\.?|প্রশ্ন|প্র\.?)\s*[\.:]?\s*\d+\s*[\.:-]?\s*/g, '')
    .replace(/^\(?\d+[\.\)\:]\s*/g, '')
    .replace(/^\(\d+\)\s*/g, '');

  // 4. Remove standard option labels if they exist inside the question sentence
  // e.g. (A), [A], A. , ক., ১.
  normalized = normalized.replace(/[\(\[]?\s*[A-Da-dকখগঘ১২৩৪i-ivI-IV]\s*[\)\]\.\:]\s*/g, '');

  // 5. Normalize math symbol / spelling variations
  normalized = normalized
    .replace(/theta/g, 'θ')
    .replace(/pi/g, 'π')
    .replace(/alpha/g, 'α')
    .replace(/beta/g, 'β')
    .replace(/gamma/g, 'γ')
    .replace(/phi/g, 'φ');

  // 6. Normalize trig function spacing
  // e.g. "sin θ" or "sin  theta" -> "sinθ"
  normalized = normalized
    .replace(/sin\s*θ/g, 'sinθ')
    .replace(/cos\s*θ/g, 'cosθ')
    .replace(/tan\s*θ/g, 'tanθ')
    .replace(/sec\s*θ/g, 'secθ')
    .replace(/cosec\s*θ/g, 'cosecθ')
    .replace(/cot\s*θ/g, 'cotθ');

  // 7. Remove LaTeX spacing delimiters
  // e.g. \, \; \! \quad \qquad \ (backslash space)
  normalized = normalized.replace(/\\(?:,|;|!|quad|qquad|\s)/g, '');

  // Remove any remaining LaTeX markup backslashes
  normalized = normalized.replace(/\\/g, '');

  // 8. Collapse duplicate punctuation
  // e.g. ?? -> ?, ... -> .
  normalized = normalized
    .replace(/\?+/g, '?')
    .replace(/\.+/g, '.')
    .replace(/!+/g, '!')
    .replace(/,+/g, ',');

  // 9. Remove all remaining whitespace and line breaks
  normalized = normalized.replace(/\s+/g, '');

  return normalized.trim();
}

/**
 * Generate SHA-256 hash for a normalized question sentence.
 */
function generateHash(normalizedQuestion) {
  return crypto.createHash('sha256').update(normalizedQuestion).digest('hex');
}

/**
 * Levenshtein distance algorithm for string similarity.
 */
function getLevenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  return dp[m][n];
}

/**
 * Calculate Jaccard word-level similarity.
 */
function getJaccardSimilarity(raw1, raw2) {
  const tokenize = (str) => {
    let text = str.toLowerCase();
    text = text.replace(/theta/g, 'θ')
               .replace(/pi/g, 'π')
               .replace(/alpha/g, 'α')
               .replace(/beta/g, 'β')
               .replace(/gamma/g, 'γ')
               .replace(/phi/g, 'φ');
    // Extract alphanumeric & math symbol tokens
    const tokens = text.match(/[a-zA-Z0-9\u0980-\u09FF\u0370-\u03FF\\+\-\*\=\/\^\$\θ\π\α\β\γ\φ]+/g) || [];
    return new Set(tokens);
  };

  const set1 = tokenize(raw1);
  const set2 = tokenize(raw2);

  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }
  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

/**
 * Calculates combined similarity using Levenshtein similarity on normalized text
 * and Jaccard token similarity on word/symbol tokens.
 */
function getSimilarityScore(raw1, raw2) {
  const norm1 = normalizeQuestion(raw1);
  const norm2 = normalizeQuestion(raw2);

  if (norm1 === norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;

  // Levenshtein similarity on fully compressed normalized forms
  const dist = getLevenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  const levSim = 1 - (dist / maxLen);

  // Jaccard similarity on raw tokens
  const jacSim = getJaccardSimilarity(raw1, raw2);

  // Return the maximum of both to capture both exact semantic changes and structural closeness
  return Math.max(levSim, jacSim);
}

class QuestionDuplicateDetector {
  /**
   * Helper exposed for external use to normalize questions.
   */
  static normalize(text) {
    return normalizeQuestion(text);
  }

  /**
   * Helper exposed to generate hash.
   */
  static hash(normalizedText) {
    return generateHash(normalizedText);
  }

  /**
   * Detect potential duplicates of a question in the database.
   * Uses classNo as partition/filter to keep candidate sets small and fast.
   * 
   * @param {string} questionText - Raw question text
   * @param {number} classNo - Class level
   * @returns {Promise<DuplicateResult>}
   */
  static async checkDuplicate(questionText, classNo) {
    if (!questionText) {
      return { duplicateDetected: false, similarity: 0, rating: 'Allow normally' };
    }

    const start = Date.now();
    const normalized = normalizeQuestion(questionText);
    const hash = generateHash(normalized);

    console.log(`[DuplicateDetector] Checking duplicate for normalized query: "${normalized}" (hash: ${hash})`);

    // 1. Indexed Lookup (Exact match)
    const exactMatch = await Question.findOne({ questionHash: hash }).lean();
    if (exactMatch) {
      console.log(`[DuplicateDetector] Exact match found in ${Date.now() - start}ms (questionHash index match)`);
      return {
        duplicateDetected: true,
        similarity: 1.0,
        rating: 'Strong duplicate warning',
        existingQuestion: exactMatch
      };
    }

    // 2. Fetch candidates from same classNo or all classes (with limit)
    const classNum = parseInt(classNo, 10);
    const filter = isNaN(classNum) ? {} : { classNo: classNum };
    const candidates = await Question.find(filter)
      .select('question questionHash chapter options')
      .limit(1000)
      .lean();

    let bestMatch = null;
    let maxSimilarity = 0.0;

    for (const cand of candidates) {
      const score = getSimilarityScore(questionText, cand.question);
      if (score > maxSimilarity) {
        maxSimilarity = score;
        bestMatch = cand;
      }
    }

    const end = Date.now();
    console.log(`[DuplicateDetector] Checked ${candidates.length} candidates in ${end - start}ms. Best match: ${maxSimilarity.toFixed(2)}`);

    if (maxSimilarity >= 0.80) {
      return {
        duplicateDetected: true,
        similarity: maxSimilarity,
        rating: maxSimilarity >= 0.95 ? 'Strong duplicate warning' : 'Possible duplicate warning',
        existingQuestion: bestMatch
      };
    }

    return {
      duplicateDetected: false,
      similarity: maxSimilarity,
      rating: 'Allow normally'
    };
  }
}

module.exports = {
  QuestionDuplicateDetector,
  normalizeQuestion,
  generateHash,
  getSimilarityScore
};
