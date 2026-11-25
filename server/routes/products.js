const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../auth');

router.get('/', (req, res) => {
  db.all('SELECT * FROM products ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(row);
  });
});

router.post('/', requireAdmin, (req, res) => {
  const { name, category, description, price, stock, image } = req.body;
  db.run(
    'INSERT INTO products (name, category, description, price, stock, image) VALUES (?, ?, ?, ?, ?, ?)',
    [name, category, description, price, stock, image || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, category, description, price, stock, image });
    }
  );
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name, category, description, price, stock, image } = req.body;
  db.run(
    'UPDATE products SET name = ?, category = ?, description = ?, price = ?, stock = ?, image = ? WHERE id = ?',
    [name, category, description, price, stock, image, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Product not found' });
      res.json({ id: req.params.id });
    }
  );
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
