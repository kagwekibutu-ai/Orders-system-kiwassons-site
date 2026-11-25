async function loadCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;
  if (cart.length === 0) {
    container.innerHTML = '<p>Your cart is empty.</p>';
    document.getElementById('checkout-btn')?.setAttribute('disabled', true);
    updateTotals(0);
    return;
  }

  const ids = cart.map(i => i.product_id).join(',');
  let products = [];
  try {
    const res = await fetch(`${API}/products`);
    products = await res.json();
  } catch (err) {
    container.innerHTML = '<p>Error loading cart.</p>';
    return;
  }

  const itemsHtml = cart.map(item => {
    const p = products.find(pr => pr.id === item.product_id);
    if (!p) return '';
    return `
      <div class="cart-item">
        <img src="${p.image || 'https://via.placeholder.com/80x80'}" alt="${p.name}">
        <div class="cart-item-info">
          <div><strong>${p.name}</strong></div>
          <div>KES ${Number(p.price).toLocaleString()} each</div>
        </div>
        <div class="cart-item-actions">
          <input type="number" value="${item.quantity}" min="1" onchange="updateQty(${p.id}, this.value)">
          <button class="remove-btn" onclick="removeItem(${p.id})">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = itemsHtml;
  const subtotal = cart.reduce((sum, item) => {
    const p = products.find(pr => pr.id === item.product_id);
    return sum + (p ? p.price * item.quantity : 0);
  }, 0);
  updateTotals(subtotal);
}

function updateTotals(subtotal) {
  const el = document.getElementById('subtotal');
  const totalEl = document.getElementById('cart-total') || document.getElementById('checkout-total');
  if (el) el.textContent = 'KES ' + Number(subtotal).toLocaleString();
  if (totalEl) totalEl.textContent = 'KES ' + Number(subtotal).toLocaleString();
}

window.updateQty = function(id, qty) {
  qty = parseInt(qty);
  if (qty < 1) qty = 1;
  const item = cart.find(i => i.product_id === id);
  if (item) item.quantity = qty;
  localStorage.setItem('kiwassons_cart', JSON.stringify(cart));
  updateCartCount();
  loadCart();
};

window.removeItem = function(id) {
  cart = cart.filter(i => i.product_id !== id);
  localStorage.setItem('kiwassons_cart', JSON.stringify(cart));
  updateCartCount();
  loadCart();
};

document.getElementById('checkout-btn')?.addEventListener('click', () => {
  location.href = 'checkout.html';
});

document.addEventListener('DOMContentLoaded', loadCart);
