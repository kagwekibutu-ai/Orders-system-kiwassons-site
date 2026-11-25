const crypto = require('crypto');

const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  });
  return token;
}

function getToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function getSession(req) {
  const token = getToken(req);
  return token ? sessions.get(token) : null;
}

function clearSession(token) {
  if (token) sessions.delete(token);
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Please register or sign in first' });
  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'CEO login required' });
  if (session.role !== 'admin') return res.status(403).json({ error: 'CEO access only' });
  req.user = session;
  next();
}

module.exports = { createSession, getToken, getSession, clearSession, requireAuth, requireAdmin };
