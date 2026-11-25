const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../auth');

function createEvent(orderId, eventType, description) {
  db.run(
    'INSERT INTO order_events (order_id, event_type, description) VALUES (?, ?, ?)',
    [orderId, eventType, description]
  );
}

function createNotification(userId, orderId, message, type = 'info') {
  db.run(
    'INSERT INTO notifications (user_id, order_id, message, type) VALUES (?, ?, ?, ?)',
    [userId, orderId, message, type]
  );
}

function normalizeDateTime(value) {
  if (!value) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  const text = String(value).replace('T', ' ');
  return text.length === 16 ? text + ':00' : text;
}

router.get('/summary', requireAdmin, (req, res) => {
  db.get(
    `SELECT
      (SELECT COUNT(*) FROM order_items) AS goods_items,
      (SELECT COUNT(*) FROM orders WHERE invoice_status = 'sent') AS invoices_sent,
      (SELECT COUNT(*) FROM payments) AS payments_count,
      (SELECT COALESCE(SUM(amount), 0) FROM payments) AS total_paid`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    }
  );
});

router.get('/goods', requireAdmin, (req, res) => {
  db.all(
    `SELECT oi.id, o.id AS order_id, o.order_number, o.created_at AS order_date,
      o.status AS order_status, o.invoice_status, o.invoice_number,
      u.name AS client_name, u.email AS client_email,
      COALESCE(p.name, 'Deleted product') AS product_name,
      oi.quantity, oi.price AS unit_price, (oi.quantity * oi.price) AS line_total
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     JOIN users u ON o.user_id = u.id
     LEFT JOIN products p ON oi.product_id = p.id
     ORDER BY o.created_at DESC, oi.id ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

router.get('/invoices', requireAdmin, (req, res) => {
  db.all(
    `SELECT o.id, o.order_number, o.invoice_number, o.invoice_status, o.invoice_sent_at,
      o.created_at AS order_date, o.total, o.amount_paid, o.payment_status,
      u.name AS client_name, u.email AS client_email
     FROM orders o JOIN users u ON o.user_id = u.id
     ORDER BY COALESCE(o.invoice_sent_at, o.created_at) DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

router.get('/payments', requireAdmin, (req, res) => {
  db.all(
    `SELECT pay.*, o.order_number, o.total AS order_total, o.amount_paid, o.payment_status,
      u.name AS client_name, u.email AS client_email, r.name AS recorded_by_name
     FROM payments pay
     JOIN orders o ON pay.order_id = o.id
     JOIN users u ON o.user_id = u.id
     LEFT JOIN users r ON pay.recorded_by = r.id
     ORDER BY pay.paid_at DESC, pay.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

router.post('/payments', requireAdmin, (req, res) => {
  const { order_id, amount, method, reference, paid_at, notes } = req.body;
  const paymentAmount = parseFloat(amount);
  if (!order_id || !paymentAmount || paymentAmount <= 0) {
    return res.status(400).json({ error: 'Select an order and enter a valid payment amount' });
  }

  db.get('SELECT id, user_id, order_number, total FROM orders WHERE id = ?', [order_id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const paidAt = normalizeDateTime(paid_at);
    db.run(
      `INSERT INTO payments (order_id, amount, method, reference, paid_at, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [order.id, paymentAmount, method || 'Cash', reference || '', paidAt, notes || '', req.user.id],
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        const paymentId = this.lastID;

        db.get('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE order_id = ?', [order.id], (err3, row) => {
          if (err3) return res.status(500).json({ error: err3.message });
          const totalPaid = Number(row.paid) || 0;
          const paymentStatus = totalPaid >= Number(order.total) ? 'paid' : 'partial';

          db.run(
            'UPDATE orders SET amount_paid = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [totalPaid, paymentStatus, order.id],
            (err4) => {
              if (err4) return res.status(500).json({ error: err4.message });

              if (paymentStatus === 'paid') {
                db.run(`UPDATE orders SET invoice_status = 'paid' WHERE id = ? AND invoice_status IN ('sent', 'paid')`, [order.id]);
              }

              createEvent(
                order.id,
                'payment_recorded',
                `Payment of KES ${paymentAmount.toLocaleString()} via ${method || 'Cash'} recorded (Ref: ${reference || 'N/A'}).`
              );
              createNotification(
                order.user_id,
                order.id,
                `Payment of KES ${paymentAmount.toLocaleString()} for order ${order.order_number} has been received and recorded.`,
                'payment'
              );

              res.json({
                success: true,
                payment_id: paymentId,
                amount_paid: totalPaid,
                payment_status: paymentStatus,
                balance: Math.max(0, Number(order.total) - totalPaid)
              });
            }
          );
        });
      }
    );
  });
});

router.get('/timeline/:orderId', requireAdmin, (req, res) => {
  db.get(
    `SELECT o.*, u.name AS client_name, u.email AS client_email, u.phone AS client_phone
     FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
    [req.params.orderId],
    (err, order) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      db.all('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC, id ASC', [order.id], (err2, events) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.all('SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at ASC, id ASC', [order.id], (err3, payments) => {
          if (err3) return res.status(500).json({ error: err3.message });

          const timeline = events
            .filter(event => event.event_type !== 'payment_recorded')
            .map(event => ({
              type: event.event_type,
              description: event.description,
              date: event.created_at
            }));

          payments.forEach(payment => {
            timeline.push({
              type: 'payment_recorded',
              description: `Payment of KES ${Number(payment.amount).toLocaleString()} via ${payment.method || 'Cash'} (Ref: ${payment.reference || 'N/A'})`,
              date: payment.paid_at
            });
          });

          if (!timeline.some(item => item.type === 'order_created')) {
            timeline.push({
              type: 'order_created',
              description: `Order ${order.order_number} was placed.`,
              date: order.created_at
            });
          }
          if (order.invoice_sent_at && !timeline.some(item => item.type === 'invoice_sent')) {
            timeline.push({
              type: 'invoice_sent',
              description: `Invoice ${order.invoice_number || 'invoice'} was sent to the client.`,
              date: order.invoice_sent_at
            });
          }

          timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
          res.json({
            order: {
              ...order,
              balance: Math.max(0, Number(order.total) - Number(order.amount_paid || 0))
            },
            events: timeline,
            payments
          });
        });
      });
    }
  );
});

module.exports = router;
