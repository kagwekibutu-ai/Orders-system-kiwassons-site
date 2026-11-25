const orderId = new URLSearchParams(window.location.search).get('id') || new URLSearchParams(window.location.search).get('order_id');

let invoiceItems = [];
let deliveryFee = 0;
let invoiceData = null;

function money(value) {
  return 'KES ' + Number(value || 0).toLocaleString();
}

function deliveryLabel(method) {
  if (method === 'delivery') return 'kiwassons Delivery';
  if (method === 'self') return 'Client Own Transport';
  return 'Pickup at Store';
}

function showBanner(text, type = '') {
  const banner = document.getElementById('invoice-status-banner');
  banner.textContent = text;
  banner.className = 'invoice-status-banner ' + type;
  banner.style.display = 'block';
}

function showMessage(text, type = 'success') {
  const el = document.getElementById('invoice-message');
  el.textContent = text;
  el.className = 'invoice-message ' + type;
  el.style.display = 'block';
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadInvoice() {
  if (!orderId) {
    showBanner('No invoice selected. Open the link from your notification or order confirmation.', 'error');
    return;
  }
  if (!currentUser || !currentUser.token) {
    showBanner('Please register or open this invoice from your notification so we can confirm it belongs to you.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/orders/${orderId}/invoice`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load invoice');
    invoiceData = data;
    invoiceItems = (data.items || []).map(item => ({
      id: item.id,
      description: item.description || '',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0
    }));
    deliveryFee = Number(data.delivery_fee) || 0;
    renderInvoice(data);
  } catch (err) {
    showBanner(err.message, 'error');
    document.getElementById('inv-items').innerHTML = '<tr><td colspan="5">Invoice could not be loaded.</td></tr>';
  }
}

function renderInvoice(o) {
  document.getElementById('inv-order-number').textContent = o.order_number;
  document.getElementById('inv-number').textContent = o.invoice_number || '--';
  const invoiceDate = o.invoice_sent_at || o.created_at;
  document.getElementById('inv-date').textContent = invoiceDate
    ? new Date(invoiceDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '--';
  document.getElementById('inv-client-name').textContent = o.customer_name || o.name || '--';
  document.getElementById('inv-client-contact').textContent = `${o.customer_email || o.email || ''}${o.customer_phone || o.phone ? ' | ' + (o.customer_phone || o.phone) : ''}`;
  document.getElementById('inv-client-address').value = o.delivery_address || o.address || "Murang'a, Kenya (https://maps.app.goo.gl/f6xpbP5TN2tVqDuK6)";
  document.getElementById('inv-order-date').textContent = new Date(o.created_at).toLocaleDateString();
  document.getElementById('inv-delivery-method').textContent = deliveryLabel(o.delivery_method);
  document.getElementById('inv-order-status').textContent = o.status;

  renderItems();
  recalculate();

  document.getElementById('invoice-notes').value = o.invoice_notes || 'Payment on collection. Thank you for shopping with kiwassons Auto Hardware.';

  let deliveryInfo = "Pickup at kiwassons Auto Hardware, Murang'a (https://maps.app.goo.gl/f6xpbP5TN2tVqDuK6).";
  if (o.delivery_method === 'delivery') deliveryInfo = `Delivery to: ${o.delivery_address || 'address to be confirmed'}`;
  if (o.delivery_method === 'self') deliveryInfo = `Collection arrangement: ${o.delivery_details || 'Client is arranging own transport'}`;
  document.getElementById('inv-delivery-info').textContent = deliveryInfo;

  if (o.status === 'ready') {
    showBanner('Your goods are ready! ' + (
      o.delivery_method === 'pickup' ? 'Please collect them from kiwassons Auto Hardware, Murang\'a.' :
      o.delivery_method === 'self' ? 'Your own transport can now collect them.' :
      'They will be delivered to your address.'
    ), 'ready');
  } else if (o.invoice_status === 'sent') {
    showBanner('This invoice has been sent to you by kiwassons Auto Hardware. You can print or save it below.');
  } else if (o.invoice_status === 'draft') {
    showBanner('The CEO is verifying your goods. This invoice is not final yet.');
  } else {
    showBanner('Your invoice is being prepared. You will receive a notification when the CEO sends it.');
  }
}

function renderItems() {
  const tbody = document.getElementById('inv-items');
  tbody.innerHTML = invoiceItems.map((item, index) => `
    <tr>
      <td><input type="number" min="1" class="qty-input" data-index="${index}" value="${Number(item.quantity) || 1}"></td>
      <td><input type="text" class="desc-input" data-index="${index}" value="${escapeHtml(item.description)}" placeholder="Item description"></td>
      <td><input type="number" min="0" step="0.01" class="price-input" data-index="${index}" value="${Number(item.unit_price) || 0}"></td>
      <td class="line-total" id="line-total-${index}">${money((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}</td>
      <td><button type="button" class="remove-btn" data-remove="${index}">&times;</button></td>
    </tr>
  `).join('');
  bindItemEvents();
}

function recalculate() {
  let subtotal = 0;
  invoiceItems.forEach((item, index) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const price = Math.max(0, Number(item.unit_price) || 0);
    const lineTotal = qty * price;
    subtotal += lineTotal;
    const lineEl = document.getElementById(`line-total-${index}`);
    if (lineEl) lineEl.textContent = money(lineTotal);
  });
  document.getElementById('inv-subtotal').textContent = money(subtotal);
  document.getElementById('inv-total').textContent = money(subtotal);
  return subtotal;
}

function bindItemEvents() {
  document.getElementById('inv-items').addEventListener('input', (event) => {
    const target = event.target;
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    if (target.classList.contains('qty-input')) invoiceItems[index].quantity = Math.max(1, parseInt(target.value, 10) || 1);
    if (target.classList.contains('desc-input')) invoiceItems[index].description = target.value;
    if (target.classList.contains('price-input')) invoiceItems[index].unit_price = Math.max(0, parseFloat(target.value) || 0);
    recalculate();
  });

  document.getElementById('inv-items').addEventListener('click', (event) => {
    const index = event.target.dataset.remove;
    if (index === undefined) return;
    if (invoiceItems.length === 1) {
      showMessage('The invoice must have at least one item.', 'error');
      return;
    }
    invoiceItems.splice(Number(index), 1);
    renderItems();
  });
}

document.getElementById('add-item-btn')?.addEventListener('click', () => {
  invoiceItems.push({ description: '', quantity: 1, unit_price: 0 });
  renderItems();
});

async function submitInvoiceEmail() {
  const items = invoiceItems.map(item => ({
    description: String(item.description || '').trim(),
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    unit_price: Math.max(0, parseFloat(item.unit_price) || 0)
  })).filter(item => item.description);

  if (!items.length) {
    showMessage('Please add at least one item with a description before submitting.', 'error');
    return;
  }

  const btn = document.getElementById('inv-submit-email');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch(`${API}/orders/${orderId}/invoice/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          items,
          notes: document.getElementById('invoice-notes').value,
          delivery_address: document.getElementById('inv-client-address').value,
          delivery_fee: deliveryFee
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not send invoice');
    showMessage(`Invoice submitted and sent to your email: ${data.sentTo || 'your email'}.`);
    btn.textContent = 'Invoice Sent';
  } catch (err) {
    showMessage(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Submit & Email Invoice';
  }
}

document.getElementById('inv-submit-email')?.addEventListener('click', submitInvoiceEmail);

document.getElementById('inv-download')?.addEventListener('click', () => window.print());

window.addEventListener('kiwassons:registered', () => loadInvoice());

document.addEventListener('DOMContentLoaded', loadInvoice);
