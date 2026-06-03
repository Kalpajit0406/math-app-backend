const ws = require('ws');
const jwt = require('jsonwebtoken');
const Attempt = require('../models/attemptModel');
const Exam = require('../models/examModel');
const attemptService = require('./attemptService');

// Map of attemptId -> session state
// Session state: { ws, userId, examId, startTime, timeRemaining, timer, reconnectTimer, lastHeartbeat }
const activeSessions = new Map();

function initExamWebSocket(server) {
  const wss = new ws.Server({ 
    noServer: true,
    path: '/api/v1/exam-ws' 
  });

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
      try {
        oldSession.ws.close();
      } catch (_) {}
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      wsConn.close(1011, 'Exam not found');
      return;
    }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt || attempt.endTime) {
      wsConn.close(1008, 'Exam session already finished');
      return;
    }

    // Calculate initial remaining seconds using server time
    const elapsedMs = Date.now() - new Date(attempt.startTime).getTime();
    const durationMs = exam.duration * 60 * 1000;
    const remainingSeconds = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));

    if (remainingSeconds <= 0) {
      // Auto submit immediately if expired
      await attemptService.submitAttempt(userId, attemptId, [], {
        isAutoSubmitted: true,
        autoSubmitReason: '⏰ Exam time has expired.'
      });
      wsConn.close(1008, 'Exam time has expired');
      return;
    }

    const session = {
      ws: wsConn,
      userId,
      examId,
      startTime: attempt.startTime,
      timeRemaining: remainingSeconds,
      lastHeartbeat: Date.now(),
      reconnectTimer: null,
      timer: null
    };

    activeSessions.set(attemptId, session);

    // Setup active countdown timer on the server side (Server authority)
    session.timer = setInterval(async () => {
      session.timeRemaining--;
      if (session.timeRemaining <= 0) {
        clearInterval(session.timer);
        console.log(`[WS Server Timer Expired] Attempt: ${attemptId}`);
        await submitOnTimeout(attemptId, '⏰ Exam time has expired.');
      }
    }, 1000);

    // Send initialization ack
    sendJson(wsConn, {
      event: 'init_ack',
      data: {
        attemptId,
        examId,
        remainingSeconds: session.timeRemaining
      }
    });

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
      // Real-time dynamic response validation & save (continuous syncing)
      if (data && data.questionId) {
        try {
          const attempt = await Attempt.findById(attemptId);
          if (attempt && !attempt.endTime) {
            // Find existing response or add new
            const idx = attempt.responses.findIndex(r => String(r.questionId) === String(data.questionId));
            if (idx !== -1) {
              attempt.responses[idx].userAnswer = data.answer;
            } else {
              attempt.responses.push({
                questionId: data.questionId,
                userAnswer: data.answer
              });
            }
            await attempt.save();
            sendJson(session.ws, {
              event: 'answer_sync_ack',
              data: { questionId: data.questionId, success: true }
            });
          }
        } catch (e) {
          console.error('[WS Sync Answer Error]', e);
        }
      }
      break;

    case 'get_question':
      // Dynamic question streaming (does not send correct answers to client)
      if (data && data.questionId) {
        try {
          const exam = await Exam.findById(session.examId);
          if (exam) {
            const question = exam.questions.id(data.questionId);
            if (question) {
              sendJson(session.ws, {
                event: 'question_data',
                data: {
                  id: question._id,
                  type: question.type,
                  questionText: question.questionText,
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
              clearInterval(session.timer);
              
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

  // Clear running tick timer
  if (session.timer) {
    clearInterval(session.timer);
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

module.exports = { initExamWebSocket };
