/**
 * Chapter Name Normalization Utility
 * Cleans chapter names to prevent duplicates and enable consistent matching.
 */

const normalizeChapterName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')                     // Decompose combined graphemes
    .replace(/[\u0300-\u036f]/g, '')     // Remove diacritics / accents
    .replace(/[^\w\s\-]/g, '')           // Remove punctuation except hyphen (keep letters, numbers, spaces)
    .replace(/[\s\_]+/g, ' ')            // Replace underscores and multiple spaces with a single space
    .trim();                             // Trim start and end whitespace
};

module.exports = { normalizeChapterName };
