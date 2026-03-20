/**
 * auth.js — JWT verification middleware
 *
 * Usage:
 *   router.get('/protected', requireAuth, handler)   — rejects if no valid token
 *   router.get('/optional', optionalAuth, handler)   — attaches user if token present
 *
 * req.user = { userId, steamId, personaName, avatarUrl }
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      // Invalid/expired token — treat as unauthenticated, don't reject
      req.user = null;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth, optionalAuth };
