let deliveryMethod = 'pickup';
let deliveryFee = 0;

function parseOrderList(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return lines.map(line => {
    const parts = line.split(/[-–—:]/);
    const name = parts[0].trim();
    let qty = 1;
    if (parts.length > 1) {
      const qtyMatch = parts[1].match(/(\d+)/);
      if (qtyMatch) qty = parseInt(qtyMatch[1], 10) || 1;
    }
    return { description: name, quantity: Math.max(1, qty) };
  });
}

function renderPreview() {
  const textarea = document.getElementById('order-list');
  const preview = document.getElementById('order-preview');
  const deliveryEl = document.getElementById('preview-delivery');
  const totalEl = document.getElementById('preview-total');
  if (!textarea || !preview) return;

  const items = parseOrderList(textarea.value);
  if (items.length === 0) {
    preview.innerHTML = '<p style="color:#666;">No items entered yet.</p>';
    if (deliveryEl) deliveryEl.textContent = 'KES 0';
    if (totalEl) totalEl.textContent = 'KES 0';
    return;
  }

  const itemsHtml = items.map(item => `
    <div class="review-item">
      <span>${item.description}</span>
      <span>x${item.quantity}</span>
    </div>
  `).join('');

  const subtotalText = items.length + ' item' + (items.length !== 1 ? 's' : '');
  preview.innerHTML = `<div class="review-item" style="font-weight:600;"><span>Items:</span><span>${subtotalText}</span></div>${itemsHtml}`;

  if (deliveryEl) deliveryEl.textContent = 'To be negotiated with CEO';
  if (totalEl) totalEl.textContent = 'Items subtotal only - delivery fee to be negotiated with CEO';
}

function initOrderForm() {
  const textarea = document.getElementById('order-list');
  const deliveryFields = document.getElementById('delivery-fields');
  const selfFields = document.getElementById('self-delivery-fields');
  const placeBtn = document.getElementById('place-order-btn');

  if (textarea) {
    textarea.addEventListener('input', renderPreview);
    renderPreview();
  }

  const radios = document.querySelectorAll('input[name="delivery_method"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      deliveryMethod = e.target.value;
      deliveryFee = 0;
      if (deliveryFields) deliveryFields.style.display = deliveryMethod === 'delivery' ? 'block' : 'none';
      if (selfFields) selfFields.style.display = deliveryMethod === 'self' ? 'block' : 'none';
      renderPreview();
    });
  });

  if (placeBtn) {
    placeBtn.addEventListener('click', async () => {
      const user = JSON.parse(localStorage.getItem('kiwassons_user') || 'null');
      if (!user || !user.token) {
        alert('Please register your details before placing an order.');
        openAuth();
        return;
      }

      const orderList = document.getElementById('order-list').value.trim();
      if (!orderList) {
        alert('Please enter your order items.');
        return;
      }

      const items = parseOrderList(orderList);
      if (items.length === 0) {
        alert('Please enter at least one item.');
        return;
      }

      const deliveryAddress = document.getElementById('delivery-address') ? document.getElementById('delivery-address').value.trim() : '';
      const deliveryDetails = document.getElementById('self-delivery-details') ? document.getElementById('self-delivery-details').value.trim() : '';

      if (deliveryMethod === 'delivery' && !deliveryAddress) {
        alert('Please enter the delivery address.');
        return;
      }
      if (deliveryMethod === 'self' && !deliveryDetails) {
        alert('Please tell us how your goods will be collected.');
        return;
      }

      const name = document.getElementById('order-name').value.trim();
      const email = document.getElementById('order-email').value.trim();
      const phone = document.getElementById('order-phone').value.trim();
      const notes = document.getElementById('order-notes') ? document.getElementById('order-notes').value : '';

      if (!name || !email || !phone) {
        alert('Please fill in your name, email, and phone.');
        return;
      }

      const payload = {
        items: items.map(i => ({ description: i.description, quantity: i.quantity })),
        delivery_method: deliveryMethod,
        delivery_address: deliveryAddress,
        delivery_details: deliveryDetails,
        delivery_fee: deliveryFee,
        notes,
        customer_name: name,
        customer_email: email,
        customer_phone: phone
      };

      placeBtn.disabled = true;
      placeBtn.textContent = 'Submitting Order...';

      try {
        const res = await fetch(`${API}/orders`, {
          method: 'POST',
          headers: authHeaders({'Content-Type': 'application/json'}),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Order submitted successfully!\nOrder Number: ${data.order_number}\n\nThe CEO will confirm your items and prices, then send your invoice by email and WhatsApp.`);
          localStorage.removeItem('kiwassons_cart');
          location.href = `invoice.html?id=${data.id}`;
        } else if (res.status === 401) {
          alert('Your session has expired. Please register again.');
          openAuth();
        } else {
          alert(data.error || 'Order failed');
          placeBtn.disabled = false;
          placeBtn.textContent = 'Submit Order';
        }
      } catch (err) {
        alert('Error: ' + err.message);
        placeBtn.disabled = false;
        placeBtn.textContent = 'Submit Order';
      }
    });
  }

  document.getElementById('order-name')?.addEventListener('input', () => {
    if (currentUser) {
      document.getElementById('order-name').value = currentUser.name || '';
      document.getElementById('order-email').value = currentUser.email || '';
      document.getElementById('order-phone').value = currentUser.phone || '';
    }
  });
}

window.addEventListener('kiwassons:registered', (event) => {
  currentUser = event.detail;
  const name = document.getElementById('order-name');
  const email = document.getElementById('order-email');
  const phone = document.getElementById('order-phone');
  if (name) name.value = currentUser.name || '';
  if (email) email.value = currentUser.email || '';
  if (phone) phone.value = currentUser.phone || '';
});

document.addEventListener('DOMContentLoaded', initOrderForm);
