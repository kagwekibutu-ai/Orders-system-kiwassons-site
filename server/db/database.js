const Database = require('sqlite3').Database;
const path = require('path');

const dbPath = path.join(__dirname, 'kiwas.db');
const db = new Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'client',
    phone TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    total REAL NOT NULL,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    shipping_address TEXT,
    delivery_method TEXT DEFAULT 'pickup',
    delivery_address TEXT,
    delivery_details TEXT,
    delivery_fee REAL DEFAULT 0,
    notes TEXT,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_id INTEGER,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  db.run(`ALTER TABLE orders ADD COLUMN delivery_method TEXT DEFAULT 'pickup'`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN delivery_address TEXT`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN delivery_details TEXT`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN delivery_fee REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN invoice_number TEXT`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN invoice_status TEXT DEFAULT 'pending'`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN invoice_notes TEXT`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN invoice_sent_at DATETIME`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN amount_paid REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN customer_name TEXT`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN customer_email TEXT`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN customer_phone TEXT`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    method TEXT,
    reference TEXT,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    recorded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (recorded_by) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;
