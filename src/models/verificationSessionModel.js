const mongoose = require('mongoose');

/**
 * VerificationItem Schema — Enhanced with full OCR metadata
 * Stores every field the pipeline produces so teachers can review
 * the full context of each extracted question.
 */
const verificationItemSchema = new mongoose.Schema({
  // ── Core fields ───────────────────────────────────────────────────────────
  questionText:   { type: String, required: true },
  options:        [{ type: String }],
  questionNumber: { type: String },
  detectionOrder: { type: Number },

  // ── Question type / format ────────────────────────────────────────────────
  format: {
    type: String,
    enum: [
      'mcq', 'line-based', 'inline-mcq', 'structured',
      'fill_in_blank', 'fill',
      'column_matching', 'table',
      'descriptive', 'other'
    ],
    default: 'mcq',
  },

  // ── Structured data for non-MCQ types ────────────────────────────────────
  columnA:         { type: [Object], default: [] },
  columnB:         { type: [Object], default: [] },
  matchingChoices: { type: [String], default: [] },
  blanks:          { type: [String], default: [] },
  blankCount:      { type: Number,   default: 0  },

  // ── Confidence scores ─────────────────────────────────────────────────────
  confidenceScores: {
    ocrConfidence:             { type: Number, default: null },
    parserConfidence:          { type: Number, default: null },
    layoutConfidence:          { type: Number, default: null },
    sectionConfidence:         { type: Number, default: null },
    structuralConfidence:      { type: Number, default: null },
    latexConfidence:           { type: Number, default: null },
    semanticConfidence:        { type: Number, default: null },
    optionIntegrityConfidence: { type: Number, default: null },
    boundaryConfidence:        { type: Number, default: null },
    composite:                 { type: Number, default: null },
    rating:                    { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  },

  // ── Diagnostics ───────────────────────────────────────────────────────────
  rawOcrData: {
    ocrConfidence: { type: Number, default: null },
    summary:       { type: String, default: '' },
    ocrHash:       { type: String, default: '' },
    sourceUsed:    { type: String, default: 'unknown' }
  },

  // ── Status ────────────────────────────────────────────────────────────────
  verified:        { type: Boolean, default: false },
  verifiedAt:      { type: Date },
  isDeleted:       { type: Boolean, default: false },
  extractionState: {
    type: String,
    enum: ['ACCEPTED', 'MANUAL_REVIEW', 'QUARANTINED', 'REJECTED'],
    default: 'ACCEPTED'
  },

  // ── Validation result ────────────────────────────────────────────────────
  validationErrors:   { type: [String], default: [] },
  validationWarnings: { type: [String], default: [] },

  // ── Duplicate Detection result ───────────────────────────────────────────
  duplicateInfo: {
    detected:             { type: Boolean, default: false },
    similarity:           { type: Number, default: 0 },
    rating:               { type: String, default: 'Allow normally' },
    existingQuestionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null },
    existingQuestionText: { type: String, default: '' },
  },
});

const verificationSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  items:     [verificationItemSchema],

  currentIndex: { type: Number, default: 0 },
  expiresAt:    { type: Date, required: true, index: { expires: 0 } }, // MongoDB TTL index

  scannedImageUrl: { type: String, default: null },
  
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'completed' },
  progress: { type: Number, default: 100 },

  // Pipeline metadata for the session
  pipelineMetadata: {
    pageType:        { type: String, default: 'UNKNOWN_PAGE' },
    sectionsFound:   { type: Number, default: 0 },
    totalExtracted:  { type: Number, default: 0 },
    totalRejected:   { type: Number, default: 0 },
    sourceUsed:      { type: String, default: 'unknown' },
    processingTimeMs:{ type: Number, default: 0 },
  },
}, { timestamps: true });

module.exports = mongoose.model('VerificationSession', verificationSessionSchema);
