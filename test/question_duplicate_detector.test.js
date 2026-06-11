/**
 * Question Duplicate Detector Test Suite
 */

'use strict';

const assert = require('assert');
const test = require('node:test');
const {
  normalizeQuestion,
  generateHash,
  normalizeComponent,
  generateContentHash,
  getSimilarityScore
} = require('../src/services/questionDuplicateDetector');

test('Question Normalization Engine', async (t) => {
  await t.test('normalizes spaces, casing, and numberings identically', () => {
    const q1 = "1. What is sin θ?";
    const q2 = "What is sinθ ?";
    const q3 = "(1) WHAT IS SIN θ?";
    const q4 = "What is sin theta?";

    const norm1 = normalizeQuestion(q1);
    const norm2 = normalizeQuestion(q2);
    const norm3 = normalizeQuestion(q3);
    const norm4 = normalizeQuestion(q4);

    assert.strictEqual(norm1, 'whatissinθ?');
    assert.strictEqual(norm2, 'whatissinθ?');
    assert.strictEqual(norm3, 'whatissinθ?');
    assert.strictEqual(norm4, 'whatissinθ?');
  });

  await t.test('removes MCQ labels inside question lines', () => {
    const q1 = "Evaluate the expression (A) sin θ";
    const norm = normalizeQuestion(q1);
    assert.strictEqual(norm, 'evaluatetheexpressionsinθ');
  });

  await t.test('removes zero-width spaces and LaTeX spacing', () => {
    const q1 = "What\\,\\;is\\!\\quad sin\\qquad\\theta?";
    const norm = normalizeQuestion(q1);
    assert.strictEqual(norm, 'whatissinθ?');
  });

  await t.test('collapses duplicate punctuation', () => {
    const q1 = "Evaluate???";
    const norm = normalizeQuestion(q1);
    assert.strictEqual(norm, 'evaluate?');
  });
});

test('SHA-256 Hashing Engine', async (t) => {
  await t.test('generates same hash for normalized equivalent questions', () => {
    const q1 = "1. What is sin θ?";
    const q2 = "What is sin theta?";

    const hash1 = generateHash(normalizeQuestion(q1));
    const hash2 = generateHash(normalizeQuestion(q2));

    assert.strictEqual(hash1, hash2);
  });
});

test('Lightweight Similarity Matching', async (t) => {
  await t.test('returns 1.0 (100%) similarity for exact matching sentences', () => {
    const q1 = "What is sin θ?";
    const q2 = "1. What is sin theta?";
    const score = getSimilarityScore(q1, q2);
    assert.strictEqual(score, 1.0);
  });

  await t.test('returns medium-high similarity for slight phrasing variations', () => {
    const q1 = "what is sin theta?";
    const q2 = "what is the sin theta?";
    const score = getSimilarityScore(q1, q2);
    // structurally extremely similar (within 80-99% boundary)
    assert.ok(score >= 0.80 && score < 1.0);
  });

  await t.test('returns low similarity for totally different questions', () => {
    const q1 = "what is sin theta?";
    const q2 = "solve the quadratic equation x^2 - 5x + 6 = 0";
    const score = getSimilarityScore(q1, q2);
    assert.ok(score < 0.50);
  });
});

test('Content Hashing and Normalization Engine', async (t) => {
  await t.test('normalizeComponent converts to lowercase, trims, and collapses spaces', () => {
    const raw = "  Choose  the   Correct  Answer ";
    const norm = normalizeComponent(raw);
    assert.strictEqual(norm, 'choose the correct answer');
  });

  await t.test('Same question text + different options => generates different contentHash', () => {
    const q1 = {
      question: "Pick the correct one",
      options: ["2 + 2 = 4", "2 + 2 = 5", "2 + 2 = 6", "2 + 2 = 7"],
      correctAnswer: "A",
      type: "mcq"
    };
    const q2 = {
      question: "Pick the correct one",
      options: ["Earth is flat", "Earth revolves around Sun", "Sun revolves around Earth", "Moon is a star"],
      correctAnswer: "B",
      type: "mcq"
    };

    const hash1 = generateContentHash(q1);
    const hash2 = generateContentHash(q2);

    assert.notStrictEqual(hash1, hash2);
    // questionHash (question text only) must still be identical
    const qHash1 = generateHash(normalizeQuestion(q1.question));
    const qHash2 = generateHash(normalizeQuestion(q2.question));
    assert.strictEqual(qHash1, qHash2);
  });

  await t.test('Same question text + same options + same answer => generates same contentHash', () => {
    const q1 = {
      question: "Pick the correct one",
      options: ["2 + 2 = 4", "2 + 2 = 5", "2 + 2 = 6", "2 + 2 = 7"],
      correctAnswer: "A",
      type: "mcq"
    };
    const q2 = {
      question: "Pick the correct one",
      options: ["2 + 2 = 4", "2 + 2 = 5", "2 + 2 = 6", "2 + 2 = 7"],
      correctAnswer: "A",
      type: "mcq"
    };

    const hash1 = generateContentHash(q1);
    const hash2 = generateContentHash(q2);

    assert.strictEqual(hash1, hash2);
  });

  await t.test('Different spacing/casing of same question/options/answer => treated as duplicate (same contentHash)', () => {
    const q1 = {
      question: " Pick  the correct one ",
      options: ["2 + 2 = 4", "2 + 2 = 5", "2 + 2 = 6", "2 + 2 = 7"],
      correctAnswer: "a",
      type: "mcq"
    };
    const q2 = {
      question: "pick the correct one",
      options: [" 2 + 2 = 4 ", "2 + 2 = 5", "2 + 2 = 6", "2 + 2 = 7"],
      correctAnswer: "A",
      type: "MCQ"
    };

    const hash1 = generateContentHash(q1);
    const hash2 = generateContentHash(q2);

    assert.strictEqual(hash1, hash2);
  });

  await t.test('OCR imports generating generic question text handled correctly', () => {
    const q1 = {
      question: "Choose the correct option",
      options: ["A", "B", "C", "D"],
      correctAnswer: "A"
    };
    const q2 = {
      question: "Choose the correct option",
      options: ["X", "Y", "Z", "W"],
      correctAnswer: "C"
    };

    const hash1 = generateContentHash(q1);
    const hash2 = generateContentHash(q2);

    assert.notStrictEqual(hash1, hash2);
  });
});
