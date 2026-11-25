const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../auth');

router.get('/', requireAdmin, (req, res) => {
  db.all('SELECT id, name, email, role, phone, address, created_at FROM users WHERE role = ? ORDER BY created_at DESC', ['client'], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== Number(req.params.id)) {
    return res.status(403).json({ error: 'You can only view your own account' });
  }
  db.get('SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  });
});

module.exports = router;
