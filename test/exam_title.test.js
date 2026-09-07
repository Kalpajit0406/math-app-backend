/**
 * Exam Title Composition Test Suite
 *
 * Pure function tests — buildExamTitle has no I/O, so this suite touches
 * no database or Redis connection.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExamTitle } = require('../src/utils/examUtils');

test('buildExamTitle', async (t) => {
  await t.test('falls back to "Class {N} - {Language}" when no name is given', () => {
    assert.equal(buildExamTitle(12, 'Both', undefined), 'Class 12 - Both');
    assert.equal(buildExamTitle(9, 'English', null), 'Class 9 - English');
    assert.equal(buildExamTitle(10, 'Bengali', ''), 'Class 10 - Bengali');
    assert.equal(buildExamTitle(10, 'Bengali', '   '), 'Class 10 - Bengali');
  });

  await t.test('appends the teacher-provided name when given', () => {
    assert.equal(buildExamTitle(12, 'Both', 'Trigonometry'), 'Class 12 - Both - Trigonometry');
  });

  await t.test('trims surrounding whitespace from the name', () => {
    assert.equal(buildExamTitle(12, 'Both', '  Mock Test 1  '), 'Class 12 - Both - Mock Test 1');
  });

  await t.test('renders classNo 13 as "Joint Entrance" instead of "Class 13"', () => {
    assert.equal(buildExamTitle(13, 'English', undefined), 'Joint Entrance - English');
    assert.equal(buildExamTitle(13, 'English', 'Final Prep'), 'Joint Entrance - English - Final Prep');
  });

  await t.test('accepts classNo as a string (as it arrives from an HTTP request body)', () => {
    assert.equal(buildExamTitle('12', 'Both', undefined), 'Class 12 - Both');
    assert.equal(buildExamTitle('13', 'Both', undefined), 'Joint Entrance - Both');
  });
});
