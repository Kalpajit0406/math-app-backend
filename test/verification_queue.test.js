const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const mongoose = require('mongoose');
const { VerificationQueueManager } = require('../src/services/verificationQueueManager');
const VerificationSession = require('../src/models/verificationSessionModel');
const Question = require('../src/models/questionModel');

test('Verification Session Persistent Queue Integration', async (t) => {
  // Connect to DB
  const connectDB = require('../src/config/db');
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  const userId = new mongoose.Types.ObjectId().toString();
  const sessionId = `test_session_${Date.now()}`;

  // Stub questions
  const parsedQuestions = [
    {
      question: 'Question 1',
      options: ['A1', 'B1', 'C1', 'D1'],
      questionNumber: '1',
      detectionOrder: 1,
      rawOcrData: { confidence: 0.99 }
    },
    {
      question: 'Question 2',
      options: ['A2', 'B2', 'C2', 'D2'],
      questionNumber: '2',
      detectionOrder: 2,
      rawOcrData: { confidence: 0.98 }
    },
    {
      question: 'Question 3',
      options: ['A3', 'B3', 'C3', 'D3'],
      questionNumber: '3',
      detectionOrder: 3,
      rawOcrData: { confidence: 0.97 }
    }
  ];

  await t.test('Create verification session', async () => {
    const session = await VerificationQueueManager.createSession(sessionId, userId, parsedQuestions);
    assert.equal(session.sessionId, sessionId);
    assert.equal(session.items.length, 3);
    assert.equal(session.currentIndex, 0);
  });

  await t.test('Get verification session and map indices', async () => {
    const session = await VerificationQueueManager.getSession(sessionId);
    assert.ok(session);
    
    // First active item is raw index 0
    const rawIdx0 = VerificationQueueManager.getRawIndex(session, 0);
    assert.equal(rawIdx0, 0);

    const filteredIdx0 = VerificationQueueManager.getFilteredIndex(session, 0);
    assert.equal(filteredIdx0, 0);
  });

  await t.test('Next and Prev question navigation', async () => {
    const nextItem = await VerificationQueueManager.nextQuestion(sessionId);
    assert.equal(nextItem.questionText, 'Question 2');

    const status = await VerificationQueueManager.getStatus(sessionId);
    assert.equal(status.currentIndex, 1);
    assert.equal(status.hasNext, true);
    assert.equal(status.hasPrev, true);

    const prevItem = await VerificationQueueManager.prevQuestion(sessionId);
    assert.equal(prevItem.questionText, 'Question 1');
  });

  await t.test('Delete item and map filtered index', async () => {
    const session = await VerificationQueueManager.getSession(sessionId);
    
    // Delete item 1 (index 1 raw, which is filtered index 1 since item 0 is active)
    const rawToDelete = VerificationQueueManager.getRawIndex(session, 1);
    assert.equal(rawToDelete, 1);

    const success = await VerificationQueueManager.removeQuestion(sessionId, rawToDelete);
    assert.ok(success);

    const updatedSession = await VerificationQueueManager.getSession(sessionId);
    assert.equal(updatedSession.items.filter(i => !i.isDeleted).length, 2);

    // Filtered index 1 should now map to raw index 2 (Question 3)
    const rawAfterDelete = VerificationQueueManager.getRawIndex(updatedSession, 1);
    assert.equal(rawAfterDelete, 2);

    const filteredAfterDelete = VerificationQueueManager.getFilteredIndex(updatedSession, 2);
    assert.equal(filteredAfterDelete, 1);
  });

  await t.test('Verify item updates session item', async () => {
    const session = await VerificationQueueManager.getSession(sessionId);
    // Let's verify Question 3 (filtered index 1, raw index 2)
    const rawIndex = VerificationQueueManager.getRawIndex(session, 1);
    assert.equal(rawIndex, 2);

    // Modify inline
    const updatedItem = await VerificationQueueManager.updateQuestion(sessionId, rawIndex, {
      questionText: 'Verified Question 3',
      options: ['V1', 'V2', 'V3', 'V4'],
      verified: true
    });

    assert.equal(updatedItem.questionText, 'Verified Question 3');
    assert.equal(updatedItem.verified, true);
    assert.ok(updatedItem.verifiedAt);

    // Clean up
    await VerificationQueueManager.clearSession(sessionId);
    const cleanedSession = await VerificationQueueManager.getSession(sessionId);
    assert.equal(cleanedSession, null);
  });

  // Close connection
  await mongoose.connection.close();
});
