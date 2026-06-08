const AuditLog = require('../models/auditLogModel');

const auditLogService = {
  log: async ({ actorId, action, targetType, targetId, metadata = {}, ipAddress = null, deviceFingerprint = null, req = null }, session = null) => {
    try {
      let finalActorId = actorId;
      if (!finalActorId && req && req.user) {
        finalActorId = req.user.id;
      }
      
      if (!finalActorId) {
        console.warn('[AuditLogService] Missing actorId for action:', action);
        return null;
      }

      let ip = ipAddress;
      let fp = deviceFingerprint;
      if (req) {
        if (!ip) {
          ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
        }
        if (!fp) {
          fp = req.body?.deviceFingerprint || req.headers['x-device-fingerprint'] || (req.user && req.user.fingerprint);
        }
      }
      
      const logEntry = new AuditLog({
        actorId: finalActorId,
        action,
        targetType,
        targetId,
        metadata,
        ipAddress: ip,
        deviceFingerprint: fp
      });
      
      const saved = await logEntry.save({ session: session ? session : undefined });
      console.log(`[AuditLog] Action "${action}" logged successfully for actor ${finalActorId}`);
      return saved;
    } catch (err) {
      console.error('[AuditLogService] Failed to save audit log:', err.message);
      return null;
    }
  }
};

module.exports = auditLogService;
