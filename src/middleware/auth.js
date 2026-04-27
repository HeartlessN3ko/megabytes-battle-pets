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

/**
 * Gate for dev-only routes. Two layers:
 *  1. Server must be started with `DEV_MODE=1` (process env).
 *  2. Request must carry header `x-dev-key` matching `DEV_MODE_KEY` env.
 *
 * Either layer missing/wrong → 403. Public builds simply leave DEV_MODE unset,
 * which kills every dev route regardless of header.
 */
function requireDevMode(req, res, next) {
  const devModeOn = String(process.env.DEV_MODE || '').toLowerCase() === '1' ||
                    String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  if (!devModeOn) return res.status(403).json({ error: 'Dev mode disabled' });

  const expected = String(process.env.DEV_MODE_KEY || '');
  if (!expected) return res.status(500).json({ error: 'DEV_MODE_KEY not configured' });

  const provided = String(req.headers['x-dev-key'] || '');
  if (provided !== expected) return res.status(403).json({ error: 'Invalid dev key' });

  return next();
}

module.exports = { optionalAuth, requireDevMode };
