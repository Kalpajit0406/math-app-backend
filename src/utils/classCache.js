const mongoose = require('mongoose');

let classByIdMap = {}; // Maps ObjectId string -> Class Document
let classByNoMap = {}; // Maps Class Number -> Class Document
let isInitialized = false;

async function initCache() {
  try {
    let Class;
    try {
      Class = mongoose.model('Class');
    } catch {
      Class = require('../models/classModel');
    }
    const classes = await Class.find({}).lean();
    classByIdMap = {};
    classByNoMap = {};
    for (const c of classes) {
      classByIdMap[c._id.toString()] = c;
      classByNoMap[Number(c.classId)] = c;
    }
    isInitialized = true;
  } catch (err) {
    console.error('[ClassCache] Error initializing class cache:', err.message);
  }
}

function getClassIdFromNo(classNo) {
  if (!isInitialized) {
    // If not initialized yet, we can try to return a dummy or fallback or trigger sync init
    // But since it is initialized on DB connect, it should be ready.
  }
  const num = Number(classNo);
  const c = classByNoMap[num];
  return c ? c._id : null;
}

function getClassNoFromId(classId) {
  if (!classId) return null;
  const idStr = classId.toString();
  const c = classByIdMap[idStr];
  return c ? Number(c.classId) : null;
}

module.exports = {
  initCache,
  getClassIdFromNo,
  getClassNoFromId
};
