/**
 * Question Duplicate Detector Test Suite
 */

'use strict';

const assert = require('assert');
const test = require('node:test');
const { normalizeQuestion, generateHash, getSimilarityScore } = require('../src/services/questionDuplicateDetector');

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
