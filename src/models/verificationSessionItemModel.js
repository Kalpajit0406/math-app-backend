const mongoose = require('mongoose');

const verificationSessionItemSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  
  questionText:   { type: String, required: true },
  options:        [{ type: String }],
  questionNumber: { type: String },
  detectionOrder: { type: Number },

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

  columnA:         { type: [Object], default: [] },
  columnB:         { type: [Object], default: [] },
  matchingChoices: { type: [String], default: [] },
  blanks:          { type: [String], default: [] },
  blankCount:      { type: Number,   default: 0  },

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

  rawOcrData: {
    ocrConfidence: { type: Number, default: null },
    summary:       { type: String, default: '' },
    ocrHash:       { type: String, default: '' },
    sourceUsed:    { type: String, default: 'unknown' }
  },

  verified:        { type: Boolean, default: false },
  verifiedAt:      { type: Date },
  isDeleted:       { type: Boolean, default: false, index: true },
  extractionState: {
    type: String,
    enum: ['ACCEPTED', 'MANUAL_REVIEW', 'QUARANTINED', 'REJECTED'],
    default: 'ACCEPTED'
  },

  validationErrors:   { type: [String], default: [] },
  validationWarnings: { type: [String], default: [] },

  duplicateInfo: {
    detected:             { type: Boolean, default: false },
    similarity:           { type: Number, default: 0 },
    rating:               { type: String, default: 'Allow normally' },
    existingQuestionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null },
    existingQuestionText: { type: String, default: '' },
  },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

// Add composite index for quick lookups inside a session
verificationSessionItemSchema.index({ sessionId: 1, detectionOrder: 1 });

module.exports = mongoose.model('VerificationSessionItem', verificationSessionItemSchema);
