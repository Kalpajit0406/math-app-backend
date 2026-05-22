const jwt = require('jsonwebtoken');

const getTokenFromHeader = (authHeader) => {
  if (!authHeader || typeof authHeader !== 'string') {
    return { token: null, reason: 'missing_header' };
  }

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') {
    return { token: null, reason: 'invalid_scheme' };
  }

  if (!token || !token.trim()) {
    return { token: null, reason: 'missing_token' };
  }

  return { token: token.trim(), reason: null };
};

const authFail = (res, message, code = 'auth_failed') => {
  return res.status(401).json({
    success: false,
    code,
    message,
  });
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  const { token, reason } = getTokenFromHeader(authHeader);

  if (!token) {
    if (reason === 'invalid_scheme') {
      return authFail(res, 'Invalid Authorization header format. Expected Bearer token.', 'invalid_auth_scheme');
    }
    return authFail(res, 'No token, authorization denied', 'missing_token');
  }

  const allowDummyAuth = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DUMMY_AUTH === 'true';
  if (token === 'dummy_token' && allowDummyAuth) {
    req.user = { id: 'dummy_user_id', role: 'student' };
    return next();
  }

  const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ success: false, code: 'server_misconfigured', message: 'JWT secret is not configured' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return authFail(res, 'Token expired. Please login again.', 'token_expired');
    }
    return authFail(res, 'Token is not valid', 'invalid_token');
  }
};

module.exports = authMiddleware;
