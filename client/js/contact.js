document.getElementById('feedback-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Sending...';
  btn.disabled = true;

  const payload = {
    name: document.getElementById('fb-name').value,
    email: document.getElementById('fb-email').value,
    phone: document.getElementById('fb-phone').value,
    whatsapp: document.getElementById('fb-whatsapp').value,
    subject: document.getElementById('fb-subject').value,
    message: document.getElementById('fb-message').value
  };

  try {
    const res = await fetch(`${API}/feedback`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('feedback-form').style.display = 'none';
      document.getElementById('feedback-success').style.display = 'block';
    } else {
      alert(data.error || 'Submission failed');
      btn.textContent = originalText;
      btn.disabled = false;
    }
  } catch (err) {
    alert('Error: ' + err.message);
    btn.textContent = originalText;
    btn.disabled = false;
  }
});
