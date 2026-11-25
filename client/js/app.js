const API = 'http://localhost:3000/api';
let cart = JSON.parse(localStorage.getItem('kiwassons_cart')) || [];
let currentUser = JSON.parse(localStorage.getItem('kiwassons_user') || 'null');

function authHeaders(extra = {}) {
  if (currentUser && currentUser.token) {
    extra.Authorization = `Bearer ${currentUser.token}`;
  }
  return extra;
}

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('#cart-count').forEach(el => el.textContent = count);
}

function addToCart(product) {
  const existing = cart.find(i => i.product_id === product.id);
  if (existing) existing.quantity += 1;
  else cart.push({ product_id: product.id, quantity: 1, price: product.price });
  localStorage.setItem('kiwassons_cart', JSON.stringify(cart));
  updateCartCount();
  alert(`${product.name} added to cart`);
}

function openAuth() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
}

function closeAuth() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
}

function toggleAuth() {
  openAuth();
}

async function handleRegister(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('reg-name').value.trim(),
    email: document.getElementById('reg-email').value.trim(),
    password: document.getElementById('reg-password').value,
    phone: document.getElementById('reg-phone').value.trim(),
    address: document.getElementById('reg-address').value.trim()
  };
  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Registration failed'); return; }

    currentUser = data;
    localStorage.setItem('kiwassons_user', JSON.stringify(data));
    closeAuth();
    updateAuthUI();
    loadNotifications();
    window.dispatchEvent(new CustomEvent('kiwassons:registered', { detail: data }));
    alert(data.returning
      ? `Welcome back, ${data.name}! You can continue placing your orders.`
      : `Welcome, ${data.name}! Your details have been registered. You can now place orders and receive notifications when they are ready.`);
  } catch (err) { alert('Error: ' + err.message); }
}

function signOut() {
  currentUser = null;
  localStorage.removeItem('kiwassons_user');
  location.reload();
}

function updateAuthUI() {
  const btn = document.getElementById('auth-btn');
  const greeting = document.getElementById('user-greeting');
  if (greeting) greeting.textContent = currentUser ? `Hi, ${currentUser.name}` : '';
  if (!btn) return;
  if (currentUser) {
    btn.textContent = 'Sign Out';
    btn.onclick = signOut;
  } else {
    btn.textContent = 'Register';
    btn.onclick = openAuth;
  }
}

async function loadNotifications() {
  if (!currentUser || !currentUser.token) return;
  try {
    const res = await fetch(`${API}/notifications/${currentUser.id}/unread`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) { signOut(); return; }
    const data = await res.json();
    const badge = document.getElementById('notify-badge');
    if (badge) {
      badge.textContent = data.count;
      badge.style.display = data.count > 0 ? 'inline-block' : 'none';
    }
  } catch (err) { console.error(err); }
}

async function fetchNotifications() {
  if (!currentUser || !currentUser.token) return [];
  try {
    const res = await fetch(`${API}/notifications/${currentUser.id}`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) { signOut(); return []; }
    return await res.json();
  } catch (err) { return []; }
}

function markNotificationRead(id) {
  if (!currentUser) return;
  fetch(`${API}/notifications/${id}/read`, { method: 'PUT', headers: authHeaders() }).then(() => loadNotifications());
}

function showNotificationsModal() {
  if (!currentUser) {
    alert('Please register your details to receive order notifications.');
    openAuth();
    return;
  }
  fetchNotifications().then(notifications => {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0'; modal.style.left = '0';
    modal.style.width = '100%'; modal.style.height = '100%';
    modal.style.background = 'rgba(22,38,96,0.7)';
    modal.style.display = 'flex'; modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center'; modal.style.zIndex = '300';
    modal.innerHTML = `
      <div style="background:#fff;color:#162660;padding:2rem;border-radius:8px;width:100%;max-width:450px;max-height:80vh;overflow-y:auto;position:relative;">
        <button style="position:absolute;top:0.5rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;" onclick="this.closest('div').remove()">&times;</button>
        <h3 style="margin-bottom:1rem;">Your Order Notifications</h3>
        ${notifications.length === 0 ? '<p>No notifications yet. We will notify you when your order is ready.</p>' : notifications.map(n => `
          <div style="border-bottom:1px solid #eee;padding:0.8rem 0;display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-weight:600;">${n.message.replace(/https?:\/\/[^\s]+/g, url => `<a href="${url}" target="_blank" style="color:#162660;text-decoration:underline;">View Invoice</a>`)}</div>
              <div style="font-size:0.8rem;color:#666;">${new Date(n.created_at).toLocaleString()}</div>
            </div>
            ${!n.is_read ? '<span style="background:#162660;color:#fff;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:10px;">New</span>' : ''}
          </div>
        `).join('')}
        <div style="margin-top:1rem;text-align:center;">
          <button onclick="this.closest('div').remove()" class="btn btn-primary btn-full">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    notifications.forEach(n => {
      if (!n.is_read) markNotificationRead(n.id);
    });
  });
}

function initAuth() {
  updateAuthUI();
  const regForm = document.getElementById('reg-form');
  if (regForm) regForm.onsubmit = handleRegister;
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  initAuth();
  loadNotifications();
  const notifyBtn = document.getElementById('notify-btn');
  if (notifyBtn) notifyBtn.onclick = showNotificationsModal;
  setInterval(loadNotifications, 30000);
});
