let products = [];

async function loadProducts() {
  try {
    const res = await fetch(`${API}/products`);
    products = await res.json();
    renderProducts(products);
  } catch (err) {
    document.getElementById('product-grid').innerHTML = '<p>Error loading products.</p>';
  }
}

function renderProducts(list) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  grid.innerHTML = list.map(p => `
    <div class="product-card">
      <img src="${p.image || 'https://via.placeholder.com/300x200'}" alt="${p.name}">
      <h3>${p.name}</h3>
      <p>${p.category}</p>
      <span class="price">KES ${Number(p.price).toLocaleString()}</span>
      <button class="btn btn-primary btn-full" onclick="addProductToCart(${p.id})">Add to Cart</button>
    </div>
  `).join('');
}

function addProductToCart(id) {
  const product = products.find(item => item.id === id);
  if (product) addToCart(product);
}

document.getElementById('category-filter')?.addEventListener('change', (e) => {
  const cat = e.target.value;
  renderProducts(cat ? products.filter(p => p.category === cat) : products);
});
document.getElementById('search-input')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderProducts(products.filter(p => p.name.toLowerCase().includes(q)));
});

document.addEventListener('DOMContentLoaded', loadProducts);
