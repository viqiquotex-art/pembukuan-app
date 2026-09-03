// ==========================================
// NEXA - KASIR
// Mobile-first POS + automatic bookkeeping
// ==========================================
(function () {
  'use strict';
  if (window.__NEXA_KASIR_INSTALLED__) return;
  window.__NEXA_KASIR_INSTALLED__ = true;

  const PRODUCT_PREFIX = 'nexa_products:';
  const CART_KEY = 'nexa_kasir_cart';
  const MAX_NAME = 100;
  const MAX_PRICE = 1_000_000_000_000_000;
  let cart = [];
  let checkoutBusy = false;

  function userKey() {
    try { return PRODUCT_PREFIX + (localStorage.getItem('cloud_userId') || 'offline'); }
    catch (_) { return PRODUCT_PREFIX + 'offline'; }
  }
  function loadProducts() {
    try {
      const raw = localStorage.getItem(userKey());
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data.filter(p => p && p.id && p.name) : [];
    } catch (_) { return []; }
  }
  function saveProducts(products) { localStorage.setItem(userKey(), JSON.stringify(products)); }
  function money(n) { return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(n)||0); }
  function esc(text) { return String(text ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch])); }
  function readCart() {
    try { const raw=sessionStorage.getItem(CART_KEY); cart=raw?JSON.parse(raw):[]; if(!Array.isArray(cart))cart=[]; }
    catch (_) { cart=[]; }
  }
  function saveCart() { try { sessionStorage.setItem(CART_KEY,JSON.stringify(cart)); } catch (_) {} }
  function productId() { return `${Date.now()}_${Math.random().toString(36).slice(2,9)}`; }

  function injectStyles() {
    if(document.getElementById('nexaKasirStyles')) return;
    const style=document.createElement('style'); style.id='nexaKasirStyles';
    style.textContent=`
      .kasir-shell{max-width:1100px;margin:0 auto}.kasir-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr);gap:18px}.kasir-card{background:var(--card-bg,#fff);border:1px solid rgba(127,127,127,.15);border-radius:18px;padding:18px}.kasir-toolbar{display:flex;gap:10px;align-items:center;margin-bottom:15px}.kasir-search{width:100%;padding:13px 15px;border:1px solid rgba(127,127,127,.2);border-radius:12px;background:transparent;font:inherit}.kasir-products{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.product-card{border:1px solid rgba(127,127,127,.15);border-radius:14px;padding:14px;text-align:left;background:transparent;cursor:pointer;min-height:112px}.product-card:active{transform:scale(.98)}.product-name{font-weight:700;font-size:14px;line-height:1.3}.product-price{font-weight:800;font-size:14px;margin-top:8px}.product-stock{font-size:11px;opacity:.58;margin-top:5px}.product-stock.low{opacity:1}.kasir-cart{position:sticky;top:14px}.cart-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.cart-head h3{margin:0}.cart-count{font-size:11px;opacity:.6}.cart-list{display:grid;gap:8px;max-height:350px;overflow:auto}.cart-item{display:grid;grid-template-columns:1fr auto;gap:8px;padding:11px;border-radius:12px;background:rgba(127,127,127,.07)}.cart-item-name{font-size:13px;font-weight:700}.cart-item-price{font-size:12px;opacity:.7;margin-top:3px}.qty{display:flex;align-items:center;gap:7px}.qty button{width:28px;height:28px;border:0;border-radius:8px;background:rgba(127,127,127,.13);font-weight:700}.qty span{min-width:16px;text-align:center;font-size:12px}.cart-total{display:flex;justify-content:space-between;align-items:end;border-top:1px solid rgba(127,127,127,.15);margin-top:15px;padding-top:15px}.cart-total span{font-size:12px;opacity:.65}.cart-total strong{font-size:22px}.payment-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.payment-btn{padding:10px;border:1px solid rgba(127,127,127,.18);border-radius:10px;background:transparent}.payment-btn.active{font-weight:700;border-color:currentColor}.kasir-checkout{width:100%;margin-top:10px;padding:14px;border:0;border-radius:12px;font-weight:800;background:var(--primary,#111);color:#fff}.kasir-checkout:disabled{opacity:.55;cursor:not-allowed}.kasir-secondary{width:100%;margin-top:8px}.kasir-empty{padding:30px 10px;text-align:center;opacity:.55;font-size:13px}.kasir-manage{display:flex;gap:8px;margin-top:14px}.kasir-manage button{flex:1}.kasir-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:flex-end;justify-content:center;z-index:1000}.kasir-modal.open{display:flex}.kasir-dialog{width:min(520px,100%);background:var(--card-bg,#fff);border-radius:20px 20px 0 0;padding:20px}.kasir-dialog h3{margin:0 0 14px}.kasir-form{display:grid;gap:10px}.kasir-form input{width:100%;box-sizing:border-box;padding:12px;border:1px solid rgba(127,127,127,.2);border-radius:10px;background:transparent;font:inherit}.kasir-form-actions{display:flex;gap:8px;margin-top:4px}.kasir-form-actions button{flex:1}.receipt-box{padding:20px;text-align:center}.receipt-box h3{margin:0 0 6px}.receipt-total{font-size:25px;font-weight:800;margin:15px 0}.receipt-items{text-align:left;padding:12px;background:rgba(127,127,127,.07);border-radius:12px;font-size:12px}.home-hub{max-width:760px}.hub-grid{grid-template-columns:1fr 1fr}.hub-card{padding:22px}.hub-card.kasir-highlight,.hub-card.pembukuan-highlight{min-height:210px}.hub-icon{width:44px;height:44px}.hub-card h3{font-size:20px}.hub-arrow{font-size:12px}
      @media(max-width:760px){.kasir-layout{grid-template-columns:1fr}.kasir-cart{position:static}.kasir-products{grid-template-columns:repeat(2,minmax(0,1fr))}.cart-list{max-height:none}.hub-grid{grid-template-columns:1fr}.hub-card.kasir-highlight,.hub-card.pembukuan-highlight{min-height:auto}.home-hero{padding-bottom:20px}}
      @media(max-width:380px){.kasir-products{grid-template-columns:1fr 1fr}.product-card{padding:11px}.kasir-card{padding:14px}}
    `;
    document.head.appendChild(style);
  }

  function buildKasirSection(){
    if(document.getElementById('kasir')) return;
    const main=document.querySelector('.main-content'); if(!main)return;
    const section=document.createElement('section'); section.id='kasir'; section.className='tab-content';
    section.innerHTML=`<div class="kasir-shell"><div class="page-heading"><div><span class="section-eyebrow">PENJUALAN</span><h2>Kasir</h2><p>Pilih produk, masukkan ke keranjang, lalu bayar.</p></div></div><div class="kasir-layout"><div class="kasir-card"><div class="kasir-toolbar"><input id="kasirSearch" class="kasir-search" type="search" placeholder="🔎 Cari produk..." autocomplete="off"></div><div id="kasirProducts" class="kasir-products"></div><div class="kasir-manage"><button class="btn btn-secondary" type="button" id="kasirAddProduct">＋ Tambah Produk</button><button class="btn btn-secondary" type="button" id="kasirManageProduct">⚙ Kelola</button></div></div><div class="kasir-card kasir-cart"><div class="cart-head"><h3>Keranjang</h3><span id="kasirCartCount" class="cart-count">0 item</span></div><div id="kasirCartList" class="cart-list"></div><div class="cart-total"><span>Total</span><strong id="kasirTotal">Rp0</strong></div><div class="payment-row"><button class="payment-btn active" data-payment="Tunai" type="button">💵 Tunai</button><button class="payment-btn" data-payment="QRIS" type="button">▣ QRIS</button></div><button class="kasir-checkout" id="kasirCheckout" type="button">Bayar Sekarang</button><button class="btn btn-secondary kasir-secondary" id="kasirClear" type="button">Kosongkan Keranjang</button></div></div></div><div id="kasirProductModal" class="kasir-modal" aria-hidden="true"><div class="kasir-dialog"><h3 id="kasirModalTitle">Tambah Produk</h3><form id="kasirProductForm" class="kasir-form"><input id="kasirProductName" required maxlength="100" placeholder="Nama produk"><input id="kasirProductPrice" required inputmode="numeric" placeholder="Harga (contoh: 15000)"><input id="kasirProductStock" required inputmode="numeric" placeholder="Stok awal" value="0"><div class="kasir-form-actions"><button class="btn btn-secondary" type="button" id="kasirModalCancel">Batal</button><button class="btn btn-primary" type="submit">Simpan Produk</button></div></form></div></div><div id="kasirManageModal" class="kasir-modal" aria-hidden="true"><div class="kasir-dialog"><h3>Kelola Produk</h3><div id="kasirManageList"></div><div class="kasir-form-actions"><button class="btn btn-secondary" type="button" id="kasirManageClose">Tutup</button></div></div></div><div id="kasirReceiptModal" class="kasir-modal" aria-hidden="true"><div class="kasir-dialog"><div id="kasirReceipt" class="receipt-box"></div><div class="kasir-form-actions"><button class="btn btn-secondary" type="button" id="kasirReceiptClose">Selesai</button></div></div></div>`;
    main.appendChild(section);
  }

  function renderProducts(){
    const box=document.getElementById('kasirProducts'); if(!box)return;
    const q=String(document.getElementById('kasirSearch')?.value||'').trim().toLowerCase();
    const products=loadProducts().filter(p=>!q||p.name.toLowerCase().includes(q)); box.replaceChildren();
    if(!products.length){const e=document.createElement('div');e.className='kasir-empty';e.style.gridColumn='1/-1';e.textContent='Belum ada produk. Tambahkan produk pertama untuk mulai berjualan.';box.appendChild(e);return;}
    products.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='product-card';b.dataset.productId=p.id;b.disabled=Number(p.stock)<=0;b.innerHTML=`<div class="product-name">${esc(p.name)}</div><div class="product-price">${money(p.price)}</div><div class="product-stock ${Number(p.stock)<=5?'low':''}">${Number(p.stock)>0?`Stok ${Number(p.stock)}`:'Stok habis'}</div>`;box.appendChild(b);});
  }
  function addToCart(id){const p=loadProducts().find(x=>x.id===id);if(!p||Number(p.stock)<=0)return;const item=cart.find(x=>x.id===id);if(item){if(item.qty<Number(p.stock))item.qty+=1;}else cart.push({id:p.id,name:p.name,price:Number(p.price),qty:1});saveCart();renderCart();}
  function renderCart(){const list=document.getElementById('kasirCartList'),count=document.getElementById('kasirCartCount'),totalEl=document.getElementById('kasirTotal');if(!list||!count||!totalEl)return;cart=cart.filter(i=>i&&i.id&&Number(i.qty)>0);if(!cart.length)list.innerHTML='<div class="kasir-empty">Keranjang masih kosong.<br>Pilih produk untuk mulai transaksi.</div>';else list.innerHTML=cart.map(i=>`<div class="cart-item"><div><div class="cart-item-name">${esc(i.name)}</div><div class="cart-item-price">${money(i.price)} × ${Number(i.qty)}</div></div><div class="qty"><button type="button" data-cart-action="minus" data-id="${esc(i.id)}">−</button><span>${Number(i.qty)}</span><button type="button" data-cart-action="plus" data-id="${esc(i.id)}">+</button></div></div>`).join('');const total=cart.reduce((s,i)=>s+Number(i.price)*Number(i.qty),0);count.textContent=`${cart.reduce((s,i)=>s+Number(i.qty),0)} item`;totalEl.textContent=money(total);saveCart();}
  function changeQty(id,delta){const item=cart.find(x=>x.id===id);if(!item)return;const p=loadProducts().find(x=>x.id===id);if(!p)return;item.qty+=delta;if(item.qty<=0)cart=cart.filter(x=>x.id!==id);else if(item.qty>Number(p.stock))item.qty=Number(p.stock);saveCart();renderCart();}
  function openModal(id){const e=document.getElementById(id);if(e){e.classList.add('open');e.setAttribute('aria-hidden','false');}}
  function closeModal(id){const e=document.getElementById(id);if(e){e.classList.remove('open');e.setAttribute('aria-hidden','true');}}
  function openProductForm(){const f=document.getElementById('kasirProductForm');if(!f)return;f.reset();document.getElementById('kasirProductStock').value='0';document.getElementById('kasirModalTitle').textContent='Tambah Produk';f.dataset.editId='';openModal('kasirProductModal');}
  function saveProduct(e){e.preventDefault();const name=document.getElementById('kasirProductName').value.trim();const price=Number(document.getElementById('kasirProductPrice').value.replace(/\D/g,''));const stock=Number(document.getElementById('kasirProductStock').value.replace(/\D/g,''));if(!name||name.length>MAX_NAME||!Number.isFinite(price)||price<=0||price>MAX_PRICE||!Number.isFinite(stock)||stock<0){if(typeof showToast==='function')showToast('❌ Data produk tidak valid','error');return;}const products=loadProducts(),editId=e.currentTarget.dataset.editId;if(editId){const p=products.find(x=>x.id===editId);if(p){p.name=name;p.price=price;p.stock=stock;}}else products.push({id:productId(),name,price,stock,createdAt:new Date().toISOString()});saveProducts(products);closeModal('kasirProductModal');renderProducts();renderCart();if(typeof showToast==='function')showToast('✅ Produk tersimpan','success');}
  function renderManage(){const box=document.getElementById('kasirManageList');if(!box)return;const products=loadProducts();if(!products.length){box.innerHTML='<div class="kasir-empty">Belum ada produk.</div>';return;}box.innerHTML=products.map(p=>`<div class="cart-item" style="margin-bottom:8px"><div><div class="cart-item-name">${esc(p.name)}</div><div class="cart-item-price">${money(p.price)} · Stok ${Number(p.stock)}</div></div><div class="qty"><button type="button" data-manage="edit" data-id="${esc(p.id)}">✏</button><button type="button" data-manage="delete" data-id="${esc(p.id)}">🗑</button></div></div>`).join('');}
  function editProduct(id){const p=loadProducts().find(x=>x.id===id);if(!p)return;document.getElementById('kasirProductName').value=p.name;document.getElementById('kasirProductPrice').value=String(p.price);document.getElementById('kasirProductStock').value=String(p.stock);document.getElementById('kasirModalTitle').textContent='Edit Produk';document.getElementById('kasirProductForm').dataset.editId=id;closeModal('kasirManageModal');openModal('kasirProductModal');}
  function deleteProduct(id){const p=loadProducts().find(x=>x.id===id);if(!p)return;if(!confirm(`Hapus produk "${p.name}"?`))return;saveProducts(loadProducts().filter(x=>x.id!==id));cart=cart.filter(x=>x.id!==id);saveCart();renderProducts();renderCart();renderManage();}

  function checkout(){
    if(checkoutBusy)return;
    if(!cart.length){if(typeof showToast==='function')showToast('🛒 Keranjang masih kosong','error');return;}
    const products=loadProducts();
    const verified=[];
    for(const item of cart){
      const p=products.find(x=>x.id===item.id); const qty=Number(item.qty); const price=Number(item.price);
      if(!p||!Number.isInteger(qty)||qty<=0||Number(p.stock)<qty){if(typeof showToast==='function')showToast(`❌ Stok ${item.name} tidak cukup`,'error');return;}
      if(!Number.isFinite(price)||price<=0||!Number.isFinite(Number(p.price))||Number(p.price)<=0){if(typeof showToast==='function')showToast('❌ Harga produk tidak valid','error');return;}
      verified.push({p,qty,price:Number(p.price)});
    }
    const total=verified.reduce((s,i)=>s+i.price*i.qty,0); if(!Number.isFinite(total)||total<=0||total>MAX_PRICE){if(typeof showToast==='function')showToast('❌ Total transaksi tidak valid','error');return;}
    checkoutBusy=true;const button=document.getElementById('kasirCheckout');if(button){button.disabled=true;button.textContent='Menyimpan...';}
    const payment=document.querySelector('.payment-btn.active')?.dataset.payment||'Tunai';
    const now=new Date(); const nowIso=now.toISOString(); const date=nowIso.split('T')[0];
    const tx={id:`kasir_${Date.now()}_${Math.random().toString(36).slice(2,10)}`,type:'income',category:'Penjualan',amount:total,date,description:'Kasir: '+verified.map(i=>`${i.p.name} x${i.qty}`).join(', ')+` · ${payment}`,createdAt:nowIso,updatedAt:nowIso,source:'kasir',paymentMethod:payment};
    try{
      const existing=typeof getTransactions==='function'?getTransactions():[];if(!Array.isArray(existing))throw new Error('Data transaksi tidak valid');
      if(existing.some(t=>t&&t.id===tx.id))throw new Error('ID transaksi duplikat');
      existing.push(tx);if(typeof saveTransactions==='function')saveTransactions(existing);else localStorage.setItem('transactions',JSON.stringify(existing));
      verified.forEach(i=>{i.p.stock=Number(i.p.stock)-i.qty;});saveProducts(products);
      const itemsSnapshot=verified.map(i=>({name:i.p.name,qty:i.qty,subtotal:i.price*i.qty}));
      cart=[];saveCart();renderProducts();renderCart();if(typeof renderHistory==='function')renderHistory();if(typeof renderRecap==='function')renderRecap();
      if(typeof isCloudConnected==='function'&&isCloudConnected()&&typeof autoSyncToCloud==='function')autoSyncToCloud();
      const receipt=document.getElementById('kasirReceipt');if(receipt)receipt.innerHTML=`<h3>Transaksi Berhasil ✓</h3><p style="opacity:.6;margin:4px 0">${esc(payment)}</p><div class="receipt-items">${itemsSnapshot.map(i=>`<div style="display:flex;justify-content:space-between;gap:8px;margin:4px 0"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.subtotal)}</span></div>`).join('')}</div><div class="receipt-total">${money(total)}</div><p style="font-size:12px;opacity:.55;margin:0">Otomatis masuk ke Pembukuan sebagai Penjualan.</p>`;openModal('kasirReceiptModal');
    }catch(error){console.error('Kasir checkout error:',error);if(typeof showToast==='function')showToast('❌ Gagal menyimpan transaksi kasir. Data tidak diubah.','error');}
    finally{checkoutBusy=false;if(button){button.disabled=false;button.textContent='Bayar Sekarang';}}
  }

  function setup(){
    injectStyles();buildKasirSection();readCart();
    const originalSwitch=window.switchTab;window.switchTab=function(tabName){if(tabName==='kasir'){document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.getElementById('kasir')?.classList.add('active');renderProducts();renderCart();return;}if(tabName==='home'){document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.getElementById('home')?.classList.add('active');document.querySelector('.tab-btn[data-tab="home"]')?.classList.add('active');return;}if(typeof originalSwitch==='function')originalSwitch(tabName);};
    document.querySelectorAll('.hub-card').forEach((card,index)=>{card.classList.add(index===0?'kasir-highlight':'pembukuan-highlight');card.onclick=()=>switchTab(index===0?'kasir':'recap');});
    document.getElementById('kasirSearch')?.addEventListener('input',renderProducts);document.getElementById('kasirProducts')?.addEventListener('click',e=>{const b=e.target.closest('[data-product-id]');if(b)addToCart(b.dataset.productId);});document.getElementById('kasirCartList')?.addEventListener('click',e=>{const b=e.target.closest('[data-cart-action]');if(b)changeQty(b.dataset.id,b.dataset.cartAction==='plus'?1:-1);});document.getElementById('kasirAddProduct')?.addEventListener('click',openProductForm);document.getElementById('kasirProductForm')?.addEventListener('submit',saveProduct);document.getElementById('kasirModalCancel')?.addEventListener('click',()=>closeModal('kasirProductModal'));document.getElementById('kasirManageProduct')?.addEventListener('click',()=>{renderManage();openModal('kasirManageModal');});document.getElementById('kasirManageClose')?.addEventListener('click',()=>closeModal('kasirManageModal'));document.getElementById('kasirManageList')?.addEventListener('click',e=>{const b=e.target.closest('[data-manage]');if(!b)return;b.dataset.manage==='edit'?editProduct(b.dataset.id):deleteProduct(b.dataset.id);});document.getElementById('kasirCheckout')?.addEventListener('click',checkout);document.getElementById('kasirClear')?.addEventListener('click',()=>{cart=[];saveCart();renderCart();});document.querySelectorAll('.payment-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.payment-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}));document.getElementById('kasirReceiptClose')?.addEventListener('click',()=>closeModal('kasirReceiptModal'));['kasirProductModal','kasirManageModal','kasirReceiptModal'].forEach(id=>document.getElementById(id)?.addEventListener('click',e=>{if(e.target.id===id)closeModal(id);}));
    renderProducts();renderCart();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();