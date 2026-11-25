let products = [];

const DELIVERY_LABELS = {
  pickup: "Pickup at Store (Murang'a - https://maps.app.goo.gl/f6xpbP5TN2tVqDuK6)",
  delivery: 'kiwassons Delivery',
  self: 'Client Own Transport'
};

function prefillClientDetails() {
  if (!currentUser) return;
  const name = document.getElementById('order-name');
  const email = document.getElementById('order-email');
  const phone = document.getElementById('order-phone');
  if (name) name.value = currentUser.name || '';
  if (email) email.value = currentUser.email || '';
  if (phone) phone.value = currentUser.phone || '';
}

async function loadCheckout() {
  const container = document.getElementById('checkout-items');
  const subtotalEl = document.getElementById('checkout-subtotal');
  const deliveryEl = document.getElementById('checkout-delivery');
  const totalEl = document.getElementById('checkout-total');
  const reviewTotalEl = document.getElementById('review-total');
  const reviewContainer = document.getElementById('order-review');
  if (!container) return;

  if (!currentUser) {
    const notice = document.getElementById('register-notice');
    if (notice) notice.style.display = 'flex';
  } else {
    prefillClientDetails();
  }

  try {
    const res = await fetch(`${API}/products`);
    products = await res.json();
  } catch (err) {
    container.innerHTML = '<p>Error loading items.</p>';
    return;
  }

  let subtotal = 0;
  const itemsHtml = cart.map(item => {
    const p = products.find(pr => pr.id === item.product_id);
    if (!p) return '';
    subtotal += p.price * item.quantity;
    return `
      <div class="review-item">
        <span>${p.name} x${item.quantity}</span>
        <span>KES ${Number(p.price * item.quantity).toLocaleString()}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = itemsHtml || '<p>No items</p>';

  let deliveryFee = 0;
  let deliveryMethod = 'pickup';

  function updateTotals() {
    const total = subtotal + deliveryFee;
    if (subtotalEl) subtotalEl.textContent = 'KES ' + Number(subtotal).toLocaleString();
    if (deliveryEl) deliveryEl.textContent = 'KES ' + Number(deliveryFee).toLocaleString();
    if (totalEl) totalEl.textContent = 'KES ' + Number(total).toLocaleString();
    if (reviewTotalEl) reviewTotalEl.textContent = 'KES ' + Number(total).toLocaleString();
  }

  function renderReview() {
    if (!reviewContainer) return;
    let html = itemsHtml;
    html += `
      <div class="review-item">
        <span>Delivery Method:</span>
        <span>${DELIVERY_LABELS[deliveryMethod]}</span>
      </div>
      ${deliveryMethod === 'delivery' ? `<div class="review-item"><span>Delivery Fee:</span><span>To be negotiated with CEO</span></div>` : ''}
      <div class="review-item" style="font-weight:600; border-top:2px solid #162660; margin-top:0.5rem; padding-top:0.5rem;">
        <span>Order Total:</span>
        <span>KES ${Number(subtotal + deliveryFee).toLocaleString()}</span>
      </div>
    `;
    reviewContainer.innerHTML = html;
  }

  const deliveryFields = document.getElementById('delivery-fields');
  const selfFields = document.getElementById('self-delivery-fields');
  const radios = document.querySelectorAll('input[name="delivery_method"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      deliveryMethod = e.target.value;
      deliveryFee = 0;
      if (deliveryFields) deliveryFields.style.display = deliveryMethod === 'delivery' ? 'block' : 'none';
      if (selfFields) selfFields.style.display = deliveryMethod === 'self' ? 'block' : 'none';
      updateTotals();
      renderReview();
    });
  });

  updateTotals();
  renderReview();
}

window.addEventListener('kiwassons:registered', (event) => {
  currentUser = event.detail;
  const notice = document.getElementById('register-notice');
  if (notice) notice.style.display = 'none';
  prefillClientDetails();
});

document.getElementById('checkout-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = JSON.parse(localStorage.getItem('kiwassons_user') || 'null');
  if (!user || !user.token) {
    alert('Please register your details before placing an order.');
    openAuth();
    return;
  }

  const deliveryMethod = document.querySelector('input[name="delivery_method"]:checked').value;
  const deliveryAddress = document.getElementById('delivery-address') ? document.getElementById('delivery-address').value.trim() : '';
  const deliveryDetails = document.getElementById('self-delivery-details') ? document.getElementById('self-delivery-details').value.trim() : '';

  if (deliveryMethod === 'delivery' && !deliveryAddress) {
    alert('Please enter the address where kiwassons should deliver your goods.');
    return;
  }
  if (deliveryMethod === 'self' && !deliveryDetails) {
    alert('Please tell us how your goods will be collected using your own transport.');
    return;
  }

  const deliveryFee = 0;

  const subtotal = cart.reduce((sum, item) => {
    const p = products.find(pr => pr.id === item.product_id);
    return sum + (p ? p.price * item.quantity : 0);
  }, 0);

  const items = cart.map(i => ({
    product_id: i.product_id,
    quantity: i.quantity
  }));

  const payload = {
    payment_method: 'Cash on Delivery',
    shipping_address: deliveryAddress,
    delivery_method: deliveryMethod,
    delivery_address: deliveryAddress,
    delivery_details: deliveryDetails,
    notes: document.getElementById('order-notes') ? document.getElementById('order-notes').value : '',
    items
  };

  if (!confirm('Please verify your order details:\n- Delivery method: ' + DELIVERY_LABELS[deliveryMethod] +
    '\n- Delivery fee: To be negotiated with CEO\n- Total shown is items subtotal only\n\nIs this correct?')) {
    return;
  }

  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: authHeaders({'Content-Type': 'application/json'}),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Order placed successfully!\nOrder Number: ${data.order_number}\nInvoice: ${data.invoice_number}\nTotal: KES ${Number(data.total).toLocaleString()}\n\nThe CEO will verify your goods and send your invoice. You will also be notified when your goods are ready.`);
      localStorage.removeItem('kiwassons_cart');
      location.href = `invoice.html?id=${data.id}`;
    } else if (res.status === 401) {
      alert('Your session has expired. Please register again.');
      openAuth();
    } else {
      alert(data.error || 'Order failed');
    }
  } catch (err) { alert('Error: ' + err.message); }
});

document.addEventListener('DOMContentLoaded', loadCheckout);
