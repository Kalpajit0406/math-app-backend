const rateLimitService = require('../services/rateLimitService');

/**
   * Reusable Express middleware generator for rate limiting.
   *
   * @param {string} prefix          - Rate limit category prefix
   * @param {number} maxPoints       - Max allowed requests within window
   * @param {number} durationSeconds - Window duration in seconds
   * @param {string} message         - Custom client error message
   */
const createRateLimiter = (prefix, maxPoints, durationSeconds, message = 'Too many requests, please try again later.') => {
  return async (req, res, next) => {
    try {
      const identifier = req.user?.id || req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const key = `${prefix}:${identifier}`;

      const { allowed, remaining, resetTime } = await rateLimitService.checkAndIncrement(key, maxPoints, durationSeconds);

      res.setHeader('X-RateLimit-Limit', maxPoints);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime.toISOString());

      if (!allowed) {
        return res.status(429).json({
          success: false,
          code: 'too_many_requests',
          message,
          retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000)
        });
      }

      next();
    } catch (err) {
      // Fallback: don't block request if rate limit middleware fails
      next();
    }
  };
};

module.exports = createRateLimiter;
