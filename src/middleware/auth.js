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
 * Gate for dev-only routes. Solo-dev phase: just `DEV_MODE=1` env on the
 * server. Public builds leave it unset → 403 on every dev route.
 *
 * Optional second layer: if `DEV_MODE_KEY` env is set, request must also
 * carry header `x-dev-key` matching it. Skipped entirely when the env
 * isn't configured. Add back when shipping publicly.
 */
function requireDevMode(req, res, next) {
  const devModeOn = String(process.env.DEV_MODE || '').toLowerCase() === '1' ||
                    String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  if (!devModeOn) return res.status(403).json({ error: 'Dev mode disabled' });

  const expected = String(process.env.DEV_MODE_KEY || '');
  if (expected) {
    const provided = String(req.headers['x-dev-key'] || '');
    if (provided !== expected) return res.status(403).json({ error: 'Invalid dev key' });
  }

  return next();
}

module.exports = { optionalAuth, requireDevMode };
