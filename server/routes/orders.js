const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../auth');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const DELIVERY_METHODS = ['pickup', 'delivery', 'self'];

let transporter = null;
let twilioClient = null;

function initEmail() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  }
}

function initTwilio() {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  if (sid && token) {
    twilioClient = twilio(sid, token);
  }
}

initEmail();
initTwilio();

async function sendEmail(to, subject, text) {
  if (!transporter) {
    console.log('[Email skipped - SMTP not configured] To:', to, 'Subject:', subject);
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER || 'kiwassons <noreply@kiwassons.com>',
      to,
      subject,
      text
    });
  } catch (err) {
    console.error('Email send error:', err.message);
  }
}

async function sendWhatsApp(to, body) {
  if (!twilioClient) {
    console.log('[WhatsApp skipped - Twilio not configured] To:', to, 'Body:', body);
    return;
  }
  try {
    const from = process.env.TWILIO_FROM || 'whatsapp:+14155238886';
    const toWhatsApp = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    await twilioClient.messages.create({ from, to: toWhatsApp, body });
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
  }
}

function generateOrderNumber() {
  return 'KWA-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function createNotification(userId, orderId, message, type = 'info') {
  db.run(
    'INSERT INTO notifications (user_id, order_id, message, type) VALUES (?, ?, ?, ?)',
    [userId, orderId, message, type]
  );
}

function createOrderEvent(orderId, eventType, description) {
  db.run(
    'INSERT INTO order_events (order_id, event_type, description) VALUES (?, ?, ?)',
    [orderId, eventType, description]
  );
}

function invoiceLink(orderId) {
  return ` View invoice: http://localhost:3000/client/invoice.html?id=${orderId}`;
}

function deliveryLabel(method) {
  if (method === 'delivery') return 'kiwassons delivery';
  if (method === 'self') return 'own transport';
  return 'pickup at the store';
}

function readyMessage(order) {
  if (order.delivery_method === 'delivery') {
    return `Great news! Your order ${order.order_number} is ready and will be delivered to your address.${invoiceLink(order.id)}`;
  }
  if (order.delivery_method === 'self') {
    return `Great news! Your order ${order.order_number} is ready for collection by your own transport.${invoiceLink(order.id)}`;
  }
    return `Great news! Your order ${order.order_number} is ready for pickup at kiwassons Auto Hardware, Murang'a (https://maps.app.goo.gl/f6xpbP5TN2tVqDuK6).${invoiceLink(order.id)}`;
}

function statusMessage(order, status) {
  if (status === 'ready') return readyMessage(order);
  if (status === 'completed') {
    if (order.delivery_method === 'delivery') {
      return `Your order ${order.order_number} has been delivered. Thank you for shopping with kiwassons Auto Hardware.${invoiceLink(order.id)}`;
    }
    if (order.delivery_method === 'self') {
      return `Your order ${order.order_number} has been collected. Thank you for shopping with kiwassons Auto Hardware.${invoiceLink(order.id)}`;
    }
    return `Your order ${order.order_number} has been collected from the store. Thank you for shopping with kiwassons Auto Hardware.${invoiceLink(order.id)}`;
  }
  if (status === 'cancelled') {
    return `Your order ${order.order_number} has been cancelled. Contact kiwassons Auto Hardware if you need help.${invoiceLink(order.id)}`;
  }
  if (status === 'processing') {
    return `Your order ${order.order_number} is being processed.${invoiceLink(order.id)}`;
  }
  return `Your order ${order.order_number} status is now ${status}.${invoiceLink(order.id)}`;
}

function ensureInvoiceItems(orderId, callback) {
  db.all('SELECT * FROM invoice_items WHERE order_id = ? ORDER BY id', [orderId], (err, items) => {
    if (err) return callback(err);
    if (items.length) return callback(null, items);

    db.all(
      `SELECT description, quantity, price AS unit_price FROM order_items WHERE order_id = ? ORDER BY id`,
      [orderId],
      (err2, orderItems) => {
        if (err2) return callback(err2);
        if (!orderItems.length) return callback(new Error('No items to invoice'));
        const stmt = db.prepare('INSERT INTO invoice_items (order_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
        orderItems.forEach(item => stmt.run(orderId, item.description, item.quantity, item.unit_price));
        stmt.finalize(err3 => {
          if (err3) return callback(err3);
          db.all('SELECT * FROM invoice_items WHERE order_id = ? ORDER BY id', [orderId], callback);
        });
      }
    );
  });
}

router.get('/', requireAuth, (req, res) => {
  const { status, user_id, delivery_method } = req.query;
  let sql = `SELECT o.*, u.name, u.email, u.phone FROM orders o JOIN users u ON o.user_id = u.id`;
  const params = [];
  const conditions = [];

  if (req.user.role === 'admin') {
    if (user_id) { conditions.push('o.user_id = ?'); params.push(user_id); }
  } else {
    conditions.push('o.user_id = ?');
    params.push(req.user.id);
  }
  if (status) { conditions.push('o.status = ?'); params.push(status); }
  if (delivery_method) { conditions.push('o.delivery_method = ?'); params.push(delivery_method); }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY o.created_at DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/stats/summary', requireAdmin, (req, res) => {
  db.get(
    `SELECT COUNT(*) AS total_orders,
      COALESCE(SUM(total), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END), 0) AS ready
     FROM orders`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    }
  );
});

router.get('/:id/invoice', requireAuth, (req, res) => {
  db.get(
    `SELECT o.*, u.name, u.email, u.phone, u.address FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
    [req.params.id],
    (err, order) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only view your own invoice' });
      }

      ensureInvoiceItems(order.id, (err2, items) => {
        if (err2) return res.status(400).json({ error: err2.message });
        const subtotal = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
        const deliveryFee = Number(order.delivery_fee) || 0;
        res.json({
          ...order,
          items,
          invoice_items: items,
          invoice_number: order.invoice_number || `INV-${order.order_number}`,
          invoice_status: order.invoice_status || 'pending',
          invoice_notes: order.invoice_notes || '',
          subtotal,
          total: subtotal + deliveryFee
        });
      });
    }
  );
});

router.put('/:id/invoice', requireAdmin, (req, res) => {
  const { items, notes } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one invoice item' });
  }

  const clean = items.map(item => ({
    description: String(item.description || '').trim(),
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    unit_price: Math.max(0, parseFloat(item.unit_price) || 0)
  })).filter(item => item.description);

  if (!clean.length) return res.status(400).json({ error: 'Add at least one valid invoice item' });

  db.get('SELECT id, order_number, delivery_fee, invoice_status, invoice_number FROM orders WHERE id = ?', [req.params.id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const subtotal = clean.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const total = subtotal + (Number(order.delivery_fee) || 0);
    const invoiceNumber = order.invoice_number || `INV-${order.order_number}`;

    db.serialize(() => {
      db.run('DELETE FROM invoice_items WHERE order_id = ?', [req.params.id], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const stmt = db.prepare('INSERT INTO invoice_items (order_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
        clean.forEach(item => stmt.run(req.params.id, item.description, item.quantity, item.unit_price));
        stmt.finalize(err3 => {
          if (err3) return res.status(500).json({ error: err3.message });

          db.run(
            `UPDATE orders SET total = ?, invoice_notes = ?, invoice_number = ?, invoice_status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [total, notes || '', invoiceNumber, req.params.id],
            function (err4) {
              if (err4) return res.status(500).json({ error: err4.message });
              createOrderEvent(order.id, 'invoice_verified', `CEO verified the goods and saved invoice ${invoiceNumber}.`);
              res.json({ success: true, subtotal, total, invoice_number: invoiceNumber, invoice_status: 'draft' });
            }
          );
        });
      });
    });
  });
});

router.post('/:id/invoice/send', requireAdmin, (req, res) => {
  db.get('SELECT id, user_id, order_number, status, delivery_fee, invoice_number FROM orders WHERE id = ?', [req.params.id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    ensureInvoiceItems(order.id, (err2, items) => {
      if (err2) return res.status(400).json({ error: err2.message });

      const subtotal = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
      const total = subtotal + (Number(order.delivery_fee) || 0);
      const invoiceNumber = order.invoice_number || `INV-${order.order_number}`;
      const nextStatus = order.status === 'pending' ? 'processing' : order.status;

      db.run(
        `UPDATE orders SET invoice_number = ?, invoice_status = 'sent', invoice_sent_at = CURRENT_TIMESTAMP, total = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [invoiceNumber, total, nextStatus, order.id],
        function (err3) {
          if (err3) return res.status(500).json({ error: err3.message });

          createNotification(
            order.user_id,
            order.id,
            `Invoice ${invoiceNumber} for order ${order.order_number} has been sent to you. View invoice: http://localhost:3000/client/invoice.html?id=${order.id}`,
            'invoice'
          );
          createOrderEvent(order.id, 'invoice_sent', `Invoice ${invoiceNumber} was sent to the client.`);

          res.json({ success: true, invoice_number: invoiceNumber, invoice_status: 'sent', total, status: nextStatus });
        }
      );
    });
  });
});

router.post('/:id/invoice/send-email', requireAuth, async (req, res) => {
  db.get('SELECT id, user_id, order_number, customer_name, customer_email, customer_phone, delivery_method, delivery_address, delivery_details, delivery_fee, invoice_number FROM orders WHERE id = ?', [req.params.id], async (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only send your own invoice' });
    }

  const { items, notes, delivery_fee } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one invoice item' });
  }

  const clean = items.map(item => ({
    description: String(item.description || '').trim(),
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    unit_price: Math.max(0, parseFloat(item.unit_price) || 0)
  })).filter(item => item.description);

  if (!clean.length) return res.status(400).json({ error: 'Add at least one valid invoice item' });

  const subtotal = clean.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const fee = Number(delivery_fee) || Number(order.delivery_fee) || 0;
  const total = subtotal + fee;
  const invoiceNumber = order.invoice_number || `INV-${order.order_number}`;

  db.serialize(() => {
    db.run('DELETE FROM invoice_items WHERE order_id = ?', [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const stmt = db.prepare('INSERT INTO invoice_items (order_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
      clean.forEach(item => stmt.run(req.params.id, item.description, item.quantity, item.unit_price));
      stmt.finalize(err3 => {
        if (err3) return res.status(500).json({ error: err3.message });

        db.run(
          `UPDATE orders SET total = ?, invoice_notes = ?, invoice_number = ?, invoice_status = 'sent', invoice_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [total, notes || '', invoiceNumber, req.params.id],
          async function (err4) {
            if (err4) return res.status(500).json({ error: err4.message });

            createOrderEvent(order.id, 'invoice_sent', `Invoice ${invoiceNumber} was sent to the client.`);

            const customerEmail = order.customer_email || '';
            const customerPhone = order.customer_phone || '';
            const customerName = order.customer_name || 'Valued Customer';
            const methodLabel = deliveryLabel(order.delivery_method);

            const itemsList = clean.map(i => `- ${i.description} x${i.quantity} @ KES ${Number(i.unit_price).toLocaleString()}`).join('\n');
            const emailBody = `Hello ${customerName},\n\nYour invoice (${invoiceNumber}) for order ${order.order_number} from kiwassons Auto Hardware is ready.\n\nItems:\n${itemsList}            	\n\nSubtotal: KES ${Number(subtotal).toLocaleString()}\nDelivery Fee: To be negotiated with CEO\nGrand Total: KES ${Number(total).toLocaleString()}\n\nDelivery option: ${methodLabel}\n${order.delivery_address ? 'Delivery Address: ' + order.delivery_address : ''}\n${order.delivery_details ? 'Transport Details: ' + order.delivery_details : ''}\n\n${notes || 'Payment on collection. Thank you for shopping with kiwassons Auto Hardware.'}            	\n\nThank you for choosing kiwassons Auto Hardware!\n\nMurang'a, Kenya - https://maps.app.goo.gl/f6xpbP5TN2tVqDuK6\nkiwashardwaressons@gmail.com\n+254721397468 / +254722230690`;

            const whatsappBody = `kiwassons Auto Hardware - Invoice Ready\nOrder: ${order.order_number}\nInvoice: ${invoiceNumber}\nCustomer: ${customerName}\nGrand Total: KES ${Number(total).toLocaleString()}\nItems:\n${itemsList}\n\nWe've sent your invoice to your email. Thank you for shopping with us!`;

            if (customerEmail) {
              await sendEmail(customerEmail, `kiwassons Auto Hardware - Invoice ${invoiceNumber}`, emailBody);
            }
            if (customerPhone) {
              await sendWhatsApp(customerPhone, whatsappBody);
            }

            createNotification(order.user_id, order.id, `Invoice ${invoiceNumber} for order ${order.order_number} has been sent to your email and WhatsApp. View invoice: http://localhost:3000/client/invoice.html?id=${order.id}`, 'invoice');

            res.json({ success: true, invoice_number: invoiceNumber, invoice_status: 'sent', total, sentTo: customerEmail || customerPhone });
          }
        );
      });
    });
  });
});

router.get('/:id', requireAuth, (req, res) => {
  db.get(
    `SELECT o.*, u.name, u.email, u.phone FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
    [req.params.id],
    (err, order) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only view your own orders' });
      }
      db.all(
        `SELECT oi.id, oi.description, oi.quantity, oi.price FROM order_items oi WHERE oi.order_id = ?`,
        [req.params.id],
        (err2, items) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ ...order, items });
        }
      );
    }
  );
});

router.post('/', requireAuth, (req, res) => {
  const { items, delivery_method, delivery_address, delivery_details, delivery_fee, notes, customer_name, customer_email, customer_phone } = req.body;
  const method = DELIVERY_METHODS.includes(delivery_method) ? delivery_method : 'pickup';

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Please enter at least one item in your order list.' });
  }

  const normalized = items.map(item => ({
    description: String(item.description || '').trim(),
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1)
  })).filter(item => item.description);

  if (normalized.length === 0) {
    return res.status(400).json({ error: 'Please enter valid items in your order list.' });
  }

  const fee = Number(delivery_fee) || 0;
  const orderNumber = generateOrderNumber();

  db.run(
    `INSERT INTO orders (order_number, user_id, total, payment_method, shipping_address, delivery_method, delivery_address, delivery_details, delivery_fee, notes, customer_name, customer_email, customer_phone, invoice_number, invoice_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderNumber,
      req.user.id,
      fee,
      'Cash on Delivery',
      delivery_address || '',
      method,
      delivery_address || '',
      delivery_details || '',
      fee,
      notes || '',
      customer_name || '',
      customer_email || '',
      customer_phone || '',
      `INV-${orderNumber}`,
      'pending'
    ],
    function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      const orderId = this.lastID;

      const stmt = db.prepare('INSERT INTO order_items (order_id, description, quantity, price) VALUES (?, ?, ?, ?)');
      normalized.forEach(item => stmt.run(orderId, item.description, item.quantity, 0));
      stmt.finalize(err3 => {
        if (err3) return res.status(500).json({ error: err3.message });

        const invStmt = db.prepare('INSERT INTO invoice_items (order_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
        normalized.forEach(item => invStmt.run(orderId, item.description, item.quantity, 0));
        invStmt.finalize(err4 => {
          if (err4) return res.status(500).json({ error: err4.message });

          db.get('SELECT name, email, phone FROM users WHERE id = ?', [req.user.id], (err5, user) => {
            if (err5) console.error(err5.message);

            const methodLabel = deliveryLabel(method);
            const orderMsg = `Your order ${orderNumber} has been received and is being processed. Delivery option: ${methodLabel}. View invoice: http://localhost:3000/client/invoice.html?id=${orderId}`;
            createNotification(req.user.id, orderId, orderMsg, 'order');
            createOrderEvent(orderId, 'order_created', `Order ${orderNumber} was placed by ${req.user.name || req.user.email}.`);

            const customerEmail = customer_email || (user ? user.email : '');
            const customerPhone = customer_phone || (user ? user.phone : '');
            const customerName = customer_name || (user ? user.name : '');

            const itemsList = normalized.map(i => `- ${i.description} x${i.quantity}`).join('\n');
            const emailBody = `Hello ${customerName || 'Valued Customer'},\n\nYour order (${orderNumber}) has been received by kiwassons Auto Hardware.\n\nItems ordered:\n${itemsList}\n\nDelivery option: ${methodLabel}\n${method === 'delivery' ? 'Delivery Address: ' + delivery_address : ''}\n${method === 'self' ? 'Transport Details: ' + delivery_details : ''}\n\nThe CEO will confirm your items and prices, then send your invoice by email and WhatsApp.\n\nThank you for choosing kiwassons!`;

            const whatsappBody = `kiwassons Order Received!\nOrder: ${orderNumber}\nCustomer: ${customerName}\nItems:\n${itemsList}\nDelivery: ${methodLabel}\nWe will confirm prices and send your invoice shortly.`;

            if (customerEmail) {
              sendEmail(customerEmail, `kiwassons Order Received - ${orderNumber}`, emailBody);
            }
            if (customerPhone) {
              sendWhatsApp(customerPhone, whatsappBody);
            }

            res.json({ id: orderId, order_number: orderNumber, total: fee, delivery_method: method, invoice_number: `INV-${orderNumber}` });
          });
        });
      });
    }
  );
});

router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['pending', 'processing', 'ready', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid order status' });
  }
  db.get('SELECT id, user_id, order_number, delivery_method FROM orders WHERE id = ?', [req.params.id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Order not found' });
      createNotification(order.user_id, order.id, statusMessage(order, status), 'order');
      createOrderEvent(order.id, 'status_changed', `Order status changed to ${status}.`);
      res.json({ updated: this.changes, status });
    });
  });
});

router.put('/:id/payment', requireAdmin, (req, res) => {
  const { payment_status } = req.body;
  db.run('UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [payment_status, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

module.exports = router;
