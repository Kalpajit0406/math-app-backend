const AuditLog = require('../models/auditLogModel');

const auditLogService = {
  log: async ({ actorId, action, targetType, targetId, metadata = {} }, session = null) => {
    try {
      if (!actorId) {
        console.warn('[AuditLogService] Missing actorId for action:', action);
        return null;
      }
      
      const logEntry = new AuditLog({
        actorId,
        action,
        targetType,
        targetId,
        metadata
      });
      
      const saved = await logEntry.save({ session: session ? session : undefined });
      console.log(`[AuditLog] Action "${action}" logged successfully for actor ${actorId}`);
      return saved;
    } catch (err) {
      console.error('[AuditLogService] Failed to save audit log:', err.message);
      return null;
    }
  }
};

module.exports = auditLogService;
