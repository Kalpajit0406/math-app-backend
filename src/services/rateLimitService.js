const RateLimit = require('../models/rateLimitModel');

const rateLimitService = {
  /**
   * Check and increment a rate limit key atomically.
   *
   * @param {string} key             - Unique key (e.g. "ip:register" or "studentId:practice")
   * @param {number} maxPoints       - Max allowed requests within window
   * @param {number} durationSeconds - Window duration in seconds
   * @returns {Promise<{allowed: boolean, remaining: number, resetTime: Date}>}
   */
  checkAndIncrement: async (key, maxPoints, durationSeconds) => {
    try {
      const now = new Date();
      const expireAt = new Date(now.getTime() + durationSeconds * 1000);

      const record = await RateLimit.findOneAndUpdate(
        { key },
        { 
          $setOnInsert: { expireAt },
          $inc: { points: 1 }
        },
        { 
          upsert: true, 
          returnDocument: 'after', 
          setDefaultsOnInsert: true 
        }
      );

      if (record.points > maxPoints) {
        return { allowed: false, remaining: 0, resetTime: record.expireAt };
      }

      return { allowed: true, remaining: maxPoints - record.points, resetTime: record.expireAt };
    } catch (error) {
      console.error('[RateLimitService] Error checking rate limit:', error.message);
      return { allowed: true, remaining: 1, resetTime: new Date() };
    }
  }
};

module.exports = rateLimitService;
