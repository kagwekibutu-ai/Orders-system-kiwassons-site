const db = require('./database');
const bcrypt = require('bcryptjs');

db.serialize(() => {
  bcrypt.hash('admin123', 10, (err, hash) => {
    db.run(
      'INSERT OR IGNORE INTO users (name, email, password, role, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
      ['CEO Admin', 'admin@kiwassons.com', hash, 'admin', '+254700000000', 'Murang\'a, Kenya'],
      (err) => {
        if (err) console.error('Admin seed error:', err.message);
        else console.log('Admin user created: admin@kiwassons.com / admin123');
      }
    );
  });

  const products = [
    ['Cement 50kg', 'Building Materials', 'Portland cement for construction', 750, 500, ''],
    ['Sand (ton)', 'Building Materials', 'Building sand for mortar and concrete', 3500, 100, ''],
    ['Ballast (ton)', 'Building Materials', 'Ballast for concrete mixing', 4000, 100, ''],
    ['PVC Pipe 4 inch', 'Plumbing', 'PVC pipe for drainage and plumbing', 1200, 200, ''],
    ['PVC Pipe 2 inch', 'Plumbing', 'PVC pipe for water supply', 800, 200, ''],
    ['Plumbing Wrench', 'Tools', 'Adjustable plumbing wrench', 1500, 50, ''],
    ['Tiles 60x60 (box)', 'Building Materials', 'Ceramic floor tiles per box', 2500, 300, ''],
    ['Paint 5L (white)', 'Building Materials', 'Emulsion paint white 5 liters', 1800, 100, ''],
    ['Rebar 12mm (6m)', 'Building Materials', 'Steel reinforcement bar', 900, 200, ''],
    ['Wire Mesh (roll)', 'Building Materials', 'Concrete reinforcement mesh', 3500, 50, '']
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO products (name, category, description, price, stock, image) VALUES (?, ?, ?, ?, ?, ?)');
  products.forEach(p => stmt.run(p));
  stmt.finalize(() => console.log('Products seeded.'));
});
