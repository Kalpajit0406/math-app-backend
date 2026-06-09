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

const resolveChapterIds = async (classIdInput, chapterNames) => {
  const mongoose = require('mongoose');
  const Chapter = mongoose.model('Chapter');
  const { getClassIdFromNo, getClassNoFromId } = require('./classCache');

  let classObjectId = classIdInput;
  let numericClass = Number(classIdInput);
  
  if (mongoose.Types.ObjectId.isValid(classIdInput)) {
    numericClass = getClassNoFromId(classIdInput);
  } else {
    classObjectId = getClassIdFromNo(classIdInput);
  }

  if (!Array.isArray(chapterNames) || chapterNames.length === 0) {
    return [];
  }

  const queryOrConditions = [];
  const parentChapters = ['11', '12', 'jee'];

  for (const name of chapterNames) {
    const normalized = normalizeChapterName(name);
    if (!normalized) continue;

    if (numericClass === 13 && parentChapters.includes(normalized)) {
      // It's a parent chapter in Class 13. Match the parent itself OR any subchapter starting with "parent "
      queryOrConditions.push({ normalizedChapterName: normalized });
      queryOrConditions.push({ normalizedChapterName: new RegExp(`^${normalized}\\s`) });
    } else {
      // Standard exact match
      queryOrConditions.push({ normalizedChapterName: normalized });
    }
  }

  if (queryOrConditions.length === 0) return [];

  const chapters = await Chapter.find({
    classId: classObjectId,
    $or: queryOrConditions
  }).select('_id');

  return chapters.map(c => c._id);
};

module.exports = { normalizeChapterName, resolveChapterIds };
