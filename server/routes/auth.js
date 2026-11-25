const express = require('express');
const router = express.Router();
const db = require('../db/database');
const bcrypt = require('bcryptjs');
const { createSession, getToken, clearSession, requireAuth } = require('../auth');

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || '',
    address: user.address || ''
  };
}

function signIn(res, user, extra = {}) {
  res.json({ ...publicUser(user), token: createSession(user), ...extra });
}

router.post('/register', (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });

    if (existing) {
      if (existing.role === 'admin') {
        return res.status(403).json({ error: 'This email belongs to the CEO. Please use the CEO login page.' });
      }
      return bcrypt.compare(password, existing.password, (err2, match) => {
        if (err2) return res.status(500).json({ error: 'Sign in failed' });
        if (!match) return res.status(400).json({ error: 'This email is already registered. Enter the correct password to continue.' });
        signIn(res, existing, { returning: true });
      });
    }

    bcrypt.hash(password, 10, (err3, hash) => {
      if (err3) return res.status(500).json({ error: 'Hashing failed' });
      db.run(
        'INSERT INTO users (name, email, password, role, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, hash, 'client', phone || '', address || ''],
        function (err4) {
          if (err4) return res.status(400).json({ error: 'Email already exists' });
          signIn(res, { id: this.lastID, name, email, role: 'client', phone, address });
        }
      );
    });
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'CEO accounts must use the CEO login page.' });
    }
    bcrypt.compare(password, user.password, (err2, match) => {
      if (err2 || !match) return res.status(401).json({ error: 'Invalid credentials' });
      signIn(res, user);
    });
  });
});

router.post('/ceo-login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid CEO credentials' });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'This login is for the CEO only. Clients should register on the shop.' });
    }
    bcrypt.compare(password, user.password, (err2, match) => {
      if (err2 || !match) return res.status(401).json({ error: 'Invalid CEO credentials' });
      signIn(res, user);
    });
  });
});

router.post('/logout', requireAuth, (req, res) => {
  clearSession(getToken(req));
  res.json({ success: true });
});

module.exports = router;
