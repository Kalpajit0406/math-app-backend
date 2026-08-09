const ws = require('ws');
const jwt = require('jsonwebtoken');
const Attempt = require('../models/attemptModel');
const Exam = require('../models/examModel');
const attemptService = require('./attemptService');
const examService = require('./examService');

// Map of attemptId -> session state
// Session state: { ws, userId, examId, startTime, timeRemaining, lastHeartbeat, reconnectTimer, pendingAnswers, lastFlush }
const activeSessions = new Map();

let globalTickTimer = null;

function startGlobalTick() {
  if (globalTickTimer) return;
  globalTickTimer = setInterval(async () => {
    const now = Date.now();
    const expiredAttemptIds = [];

    for (const [attemptId, session] of activeSessions.entries()) {
      session.timeRemaining--;

      // Periodic answer flush every 15 seconds
      if (session.pendingAnswers && session.pendingAnswers.size > 0) {
        if (!session.lastFlush || (now - session.lastFlush) >= 15000) {
          session.lastFlush = now;
          flushSessionAnswers(attemptId, session).catch(err => {
            console.error(`[WS Global Tick Flush Error] ${attemptId}`, err);
          });
        }
      }

      if (session.timeRemaining <= 0) {
        expiredAttemptIds.push(attemptId);
      }
    }

    for (const attemptId of expiredAttemptIds) {
      console.log(`[WS Global Timer Expired] Attempt: ${attemptId}`);
      await submitOnTimeout(attemptId, '⏰ Exam time has expired.');
    }
  }, 1000);
}

async function flushSessionAnswers(attemptId, session) {
  if (!session || !session.pendingAnswers || session.pendingAnswers.size === 0) return;

  const answersToFlush = new Map(session.pendingAnswers);
  session.pendingAnswers.clear();

  try {
    const attempt = await Attempt.findById(attemptId);
    if (!attempt || attempt.endTime) return;

    let modified = false;
    for (const [qIdStr, ansVal] of answersToFlush.entries()) {
      const idx = attempt.responses.findIndex(r => String(r.questionId) === qIdStr);
      if (idx !== -1) {
        if (attempt.responses[idx].userAnswer !== ansVal) {
          attempt.responses[idx].userAnswer = ansVal;
          modified = true;
        }
      } else {
        attempt.responses.push({
          questionId: qIdStr,
          userAnswer: ansVal
        });
        modified = true;
      }
    }
    if (modified) {
      await attempt.save();
    }
  } catch (err) {
    console.error(`[WS Flush Answers Error] Attempt: ${attemptId}`, err.message);
    // Put failed answers back into pending map if session is still alive
    if (session && session.pendingAnswers) {
      for (const [qIdStr, ansVal] of answersToFlush.entries()) {
        if (!session.pendingAnswers.has(qIdStr)) {
          session.pendingAnswers.set(qIdStr, ansVal);
        }
      }
    }
  }
}

async function flushAllPendingAnswers() {
  console.log(`[WS] Flushing pending answers for ${activeSessions.size} active sessions...`);
  const promises = [];
  for (const [attemptId, session] of activeSessions.entries()) {
    if (session.pendingAnswers && session.pendingAnswers.size > 0) {
      promises.push(flushSessionAnswers(attemptId, session));
    }
  }
  await Promise.all(promises);
  console.log('[WS] All pending answers flushed.');
}

function initExamWebSocket(server) {
  const wss = new ws.Server({ 
    noServer: true,
    path: '/api/v1/exam-ws' 
  });

  startGlobalTick();

  // Handle upgrade request manually to support query params and JWT auth
  server.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname !== '/api/v1/exam-ws') {
        socket.destroy();
        return;
      }

      const token = url.searchParams.get('token');
      const attemptId = url.searchParams.get('attemptId');

      if (!token || !attemptId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
      let decoded;
      try {
        decoded = jwt.verify(token, jwtSecret);
      } catch (err) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Check if attempt exists and is not ended
      const attempt = await Attempt.findById(attemptId);
      if (!attempt || attempt.endTime || String(attempt.userId) !== String(decoded.id)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (wsConn) => {
        wss.emit('connection', wsConn, decoded.id, attemptId, attempt.examId);
      });
    } catch (error) {
      console.error('[WS Upgrade Error]', error);
      socket.destroy();
    }
  });

  wss.on('connection', async (wsConn, userId, attemptId, examId) => {
    console.log(`[WS Connected] User: ${userId}, Attempt: ${attemptId}`);

    // If session already exists and has active socket, terminate the old one
    if (activeSessions.has(attemptId)) {
      const oldSession = activeSessions.get(attemptId);
      if (oldSession.reconnectTimer) {
        clearTimeout(oldSession.reconnectTimer);
      }
      if (oldSession.pendingAnswers && oldSession.pendingAnswers.size > 0) {
        await flushSessionAnswers(attemptId, oldSession);
      }
      try {
        oldSession.ws.close();
      } catch (_) {}
    }

    const session = {
      ws: wsConn,
      userId,
      examId,
      startTime: new Date(),
      timeRemaining: 0,
      lastHeartbeat: Date.now(),
      reconnectTimer: null,
      pendingAnswers: new Map(),
      lastFlush: Date.now()
    };

    activeSessions.set(attemptId, session);

    // Register message/close/error handlers IMMEDIATELY to avoid dropping early frames
    wsConn.on('message', async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage);
        await handleClientMessage(session, attemptId, message);
      } catch (err) {
        console.error('[WS Message Handle Error]', err);
        sendJson(wsConn, { event: 'error', message: 'Malformed frame or operation failure' });
      }
    });

    wsConn.on('close', (code, reason) => {
      console.log(`[WS Closed] Attempt: ${attemptId}, Code: ${code}, Reason: ${reason}`);
      handleDisconnect(attemptId);
    });

    wsConn.on('error', (err) => {
      console.error(`[WS Connection Error] Attempt: ${attemptId}`, err);
      handleDisconnect(attemptId);
    });

    // Use Redis-cached exam lookup and Attempt lookup in parallel
    const [exam, attempt] = await Promise.all([
      examService.getExamById(examId),
      Attempt.findById(attemptId)
    ]);

    if (!exam) {
      wsConn.close(1011, 'Exam not found');
      activeSessions.delete(attemptId);
      return;
    }

    if (!attempt || attempt.endTime) {
      wsConn.close(1008, 'Exam session already finished');
      activeSessions.delete(attemptId);
      return;
    }

    // Calculate initial remaining seconds — cap against BOTH the per-student
    // duration elapsed AND the absolute scheduled exam end time (same logic as
    // startAttempt) so the WS timer never gives a student more time than the
    // exam window allows.
    const { getExamEndTime } = require('../utils/examUtils');
    const elapsedMs = Date.now() - new Date(attempt.startTime).getTime();
    const durationMs = exam.duration * 60 * 1000;
    let remainingSeconds = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));

    const examEndTime = getExamEndTime(exam);
    if (examEndTime) {
      const now2 = new Date();
      const secondsUntilAbsoluteEnd = Math.max(0, Math.ceil((examEndTime.getTime() - now2.getTime()) / 1000));
      remainingSeconds = Math.min(remainingSeconds, secondsUntilAbsoluteEnd);
    }

    if (remainingSeconds <= 0) {
      // Auto submit immediately if expired
      await attemptService.submitAttempt(userId, attemptId, [], {
        isAutoSubmitted: true,
        autoSubmitReason: '⏰ Exam time has expired.'
      });
      wsConn.close(1008, 'Exam time has expired');
      activeSessions.delete(attemptId);
      return;
    }

    session.startTime = attempt.startTime;
    session.timeRemaining = remainingSeconds;

    // Send initialization ack
    sendJson(wsConn, {
      event: 'init_ack',
      data: {
        attemptId,
        examId,
        remainingSeconds: session.timeRemaining
      }
    });
  });
}

async function handleClientMessage(session, attemptId, message) {
  session.lastHeartbeat = Date.now();
  const { event, data } = message;

  switch (event) {
    case 'heartbeat':
      // Acknowledge heartbeat with server time and remaining seconds
      sendJson(session.ws, {
        event: 'heartbeat_ack',
        data: {
          remainingSeconds: session.timeRemaining,
          serverTimestamp: Date.now()
        }
      });
      break;

    case 'submit_answer':
      // Buffer answer in memory for batch flush
      if (data && data.questionId) {
        session.pendingAnswers.set(String(data.questionId), data.answer !== undefined ? data.answer : '');
        sendJson(session.ws, {
          event: 'answer_sync_ack',
          data: { questionId: data.questionId, success: true }
        });
      }
      break;

    case 'get_question':
      // Dynamic question streaming (uses Redis-cached exam model)
      if (data && data.questionId) {
        try {
          const exam = await examService.getExamById(session.examId);
          if (exam) {
            let question = null;
            if (exam.questions && Array.isArray(exam.questions)) {
              const qIdStr = String(data.questionId);
              question = exam.questions.find(q => (q._id && String(q._id) === qIdStr) || (q.id && String(q.id) === qIdStr));
            }
            if (question) {
              sendJson(session.ws, {
                event: 'question_data',
                data: {
                  id: question._id || question.id,
                  type: question.type,
                  questionText: question.questionText || question.question,
                  options: question.options,
                  diagram: question.diagram
                }
              });
            } else {
              sendJson(session.ws, { event: 'error', message: 'Question not found' });
            }
          }
        } catch (e) {
          console.error('[WS Stream Question Error]', e);
        }
      }
      break;

    case 'telemetry':
      // Validate security telemetry events
      if (data && data.violation) {
        const { type, severity, message: vMsg } = data.violation;
        console.warn(`[WS Telemetry Violation Received] Attempt: ${attemptId}, Type: ${type}, Severity: ${severity}`);
        
        try {
          const attempt = await Attempt.findById(attemptId);
          if (attempt && !attempt.endTime) {
            attempt.violations.push({
              type,
              severity,
              message: vMsg,
              timestamp: new Date()
            });

            // Set flags if root/emulator detected
            if (type === 'rootDetected') attempt.rootDetected = true;
            if (type === 'emulatorDetected') attempt.emulatorDetected = true;

            await attempt.save();

            // If severity is critical, instantly invalidate and terminate exam
            if (severity === 'critical') {
              console.error(`[WS Invalidation Action] Terminating due to critical violation: ${type}`);
              
              if (session.pendingAnswers && session.pendingAnswers.size > 0) {
                await flushSessionAnswers(attemptId, session);
              }

              await attemptService.submitAttempt(session.userId, attemptId, [], {
                violations: attempt.violations,
                isAutoSubmitted: true,
                autoSubmitReason: `🔒 Security Telemetry Invalidation: ${vMsg}`,
                emulatorDetected: attempt.emulatorDetected,
                rootDetected: attempt.rootDetected
              });

              sendJson(session.ws, {
                event: 'terminate',
                reason: `Security Violation: ${vMsg}`
              });

              setTimeout(() => {
                try { session.ws.close(1008, 'Security violation terminated exam'); } catch (_) {}
              }, 500);

              activeSessions.delete(attemptId);
            }
          }
        } catch (e) {
          console.error('[WS Save Telemetry Error]', e);
        }
      }
      break;

    default:
      console.warn(`[WS Unknown Event] ${event}`);
      break;
  }
}

function handleDisconnect(attemptId) {
  const session = activeSessions.get(attemptId);
  if (!session) return;

  // Flush pending answers on disconnect asynchronously
  if (session.pendingAnswers && session.pendingAnswers.size > 0) {
    flushSessionAnswers(attemptId, session).catch(err => {
      console.error(`[WS Disconnect Flush Error] Attempt: ${attemptId}`, err);
    });
  }

  // Start 15-second reconnect countdown
  console.log(`[WS Reconnect Timer Started] Attempt: ${attemptId} — waiting 15s`);
  session.reconnectTimer = setTimeout(async () => {
    console.warn(`[WS Reconnect Timeout Reached] Auto-submitting attempt: ${attemptId}`);
    await submitOnTimeout(attemptId, '🔌 Network disconnection timeout exceeded.');
  }, 15000);
}

async function submitOnTimeout(attemptId, reason) {
  const session = activeSessions.get(attemptId);
  if (!session) return;

  try {
    if (session.pendingAnswers && session.pendingAnswers.size > 0) {
      await flushSessionAnswers(attemptId, session);
    }
    const attempt = await Attempt.findById(attemptId);
    if (attempt && !attempt.endTime) {
      attempt.violations.push({
        type: 'networkTimeout',
        severity: 'critical',
        message: reason,
        timestamp: new Date()
      });
      await attemptService.submitAttempt(session.userId, attemptId, [], {
        violations: attempt.violations,
        isAutoSubmitted: true,
        autoSubmitReason: reason,
        emulatorDetected: attempt.emulatorDetected,
        rootDetected: attempt.rootDetected
      });
    }
  } catch (e) {
    console.error(`[WS Timeout Submit Failed] ${attemptId}`, e);
  } finally {
    activeSessions.delete(attemptId);
  }
}

function sendJson(wsConn, obj) {
  if (wsConn && wsConn.readyState === ws.OPEN) {
    try {
      wsConn.send(JSON.stringify(obj));
    } catch (_) {}
  }
}

module.exports = { initExamWebSocket, flushAllPendingAnswers };
