const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../auth');
const nodemailer = require('nodemailer');

// Email transporter (configure with your SMTP credentials in .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// WhatsApp notification placeholder (integrate with Twilio/WhatsApp Business API)
async function sendWhatsApp(phone, message) {
  console.log(`[WhatsApp] Sending to ${phone}: ${message}`);
  // Example Twilio integration:
  // const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  // return client.messages.create({ body: message, from: process.env.TWILIO_FROM, to: phone });
  return { success: true, provider: 'placeholder' };
}

// Send email notification
async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER) {
    console.log(`[Email] Would send to ${to}: ${subject}`);
    return { success: true, provider: 'placeholder' };
  }
  return transporter.sendMail({
    from: `"kiwassons Auto Hardware" <kiwashardwaressons@gmail.com>`,
    to,
    subject,
    html
  });
}

router.post('/', (req, res) => {
  const { name, email, phone, whatsapp, subject, message } = req.body;
  if (!name || !email || !phone || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const whatsappNumber = whatsapp || phone;

  db.run(
    `INSERT INTO feedback (name, email, phone, whatsapp, subject, message) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, email, phone, whatsappNumber, subject, message],
    async function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;

      // Notify client via email
      const clientEmailHtml = `
        <h2>Thank you for contacting kiwassons Auto Hardware</h2>
        <p>Dear ${name},</p>
        <p>We have received your feedback regarding: <strong>${subject}</strong></p>
        <p>Your message: ${message}</p>
        <p>Our team will get back to you shortly via email and WhatsApp.</p>
        <p>Order/Feedback Reference: #FB-${id}</p>
        <br/>
        <p>kiwassons Auto Hardware - Murang'a, Kenya (https://maps.app.goo.gl/f6xpbP5TN2tVqDuK6)</p>
      `;
      sendEmail(email, 'Feedback Received - kiwassons Auto Hardware', clientEmailHtml);

      // Notify client via WhatsApp
      const waMsg = `Hi ${name}, we received your feedback about "${subject}" (Ref: #FB-${id}). We'll contact you soon. - kiwassons Auto Hardware`;
      sendWhatsApp(whatsappNumber, waMsg);

      // Notify admin (CEO) via email and WhatsApp
      const adminEmailHtml = `
        <h2>New Feedback Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>WhatsApp:</strong> ${whatsappNumber}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong> ${message}</p>
        <p><strong>Reference:</strong> #FB-${id}</p>
      `;
      sendEmail('kiwashardwaressons@gmail.com', 'New Client Feedback - kiwassons', adminEmailHtml);
      sendWhatsApp(process.env.ADMIN_WHATSAPP || '+254721397468', `New feedback from ${name} (${email}): ${subject} - Ref: #FB-${id}`);

      res.json({ success: true, id, message: 'Feedback submitted. You will be notified via email and WhatsApp.' });
    }
  );
});

router.get('/', requireAdmin, (req, res) => {
  db.all('SELECT * FROM feedback ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/:id', requireAdmin, (req, res) => {
  db.get('SELECT * FROM feedback WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Feedback not found' });
    res.json(row);
  });
});

router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.get('SELECT * FROM feedback WHERE id = ?', [req.params.id], (err, f) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!f) return res.status(404).json({ error: 'Feedback not found' });
    db.run('UPDATE feedback SET status = ? WHERE id = ?', [status, req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      // Notify client of status update
      const waMsg = `Hi ${f.name}, your feedback "${f.subject}" (Ref: #FB-${f.id}) is now ${status}. - kiwassons Auto Hardware`;
      sendWhatsApp(f.whatsapp, waMsg);
      sendEmail(f.email, `Feedback Update: ${f.subject}`, `<p>Hi ${f.name}, your feedback is now <strong>${status}</strong>. Ref: #FB-${f.id}</p>`);
      res.json({ updated: this.changes });
    });
  });
});

module.exports = router;
