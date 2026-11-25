const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('../auth');

function canAccess(req, userId) {
  return req.user.role === 'admin' || req.user.id === Number(userId);
}

router.get('/:userId', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.userId)) {
    return res.status(403).json({ error: 'You can only view your own notifications' });
  }
  db.all(
    `SELECT n.*, o.order_number FROM notifications n LEFT JOIN orders o ON n.order_id = o.id WHERE n.user_id = ? ORDER BY n.created_at DESC`,
    [req.params.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

router.get('/:userId/unread', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.userId)) {
    return res.status(403).json({ error: 'You can only view your own notifications' });
  }
  db.get('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [req.params.userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: row.count });
  });
});

router.put('/:id/read', requireAuth, (req, res) => {
  db.get('SELECT user_id FROM notifications WHERE id = ?', [req.params.id], (err, notification) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    if (!canAccess(req, notification.user_id)) {
      return res.status(403).json({ error: 'You can only update your own notifications' });
    }
    db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ updated: this.changes });
    });
  });
});

router.put('/:userId/read-all', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.userId)) {
    return res.status(403).json({ error: 'You can only update your own notifications' });
  }
  db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.params.userId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

module.exports = router;
