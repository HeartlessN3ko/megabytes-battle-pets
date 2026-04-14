const jwt = require('jsonwebtoken');

function isAuthRequired() {
  return String(process.env.AUTH_REQUIRED || '').toLowerCase() === 'true';
}

function getBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const [scheme, token] = headerValue.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
}

function optionalAuth(req, res, next) {
  if (!isAuthRequired()) return next();

  const token = getBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Auth required' });
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT_SECRET not configured' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { userId: String(decoded.id || '') };
    if (!req.auth.userId) return res.status(401).json({ error: 'Invalid token payload' });
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { optionalAuth };
