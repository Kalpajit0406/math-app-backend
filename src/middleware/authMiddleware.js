const jwt = require('jsonwebtoken');

const getTokenFromHeader = (authHeader) => {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

const authMiddleware = (req, res, next) => {
  const token = getTokenFromHeader(req.header('Authorization'));

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const allowDummyAuth = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DUMMY_AUTH === 'true';
  if (token === 'dummy_token' && allowDummyAuth) {
    req.user = { id: 'dummy_user_id', role: 'student' };
    return next();
  }

  const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ message: 'JWT secret is not configured' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = authMiddleware;
