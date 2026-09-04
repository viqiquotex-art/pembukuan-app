// ==========================================
// NEXA - ATOMIC INVENTORY DURABLE OBJECT
// ==========================================
// A single Durable Object instance owns one user's inventory. All mutations
// for that user are serialized by Cloudflare, preventing concurrent checkouts
// from racing on stock values.

export class InventoryDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ready = null;
  }

  async ensureLoaded() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const marker = await this.state.storage.get('initialized');
      if (marker) return;
      const userId = this.state.id.toString();
      const prefix = `product:${userId}:`;
      const products = [];
      let cursor;
      do {
        const page = await this.env.PEMBUKUAN_KV.list({ prefix, cursor });
        const values = await Promise.all(page.keys.map(k => this.env.PEMBUKUAN_KV.get(k.name)));
        values.forEach(raw => {
          if (!raw) return;
          try {
            const p = JSON.parse(raw);
            if (validProduct(p)) products.push(p);
          } catch {}
        });
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);

      const batch = products.map(p => this.state.storage.put(`product:${p.id}`, p));
      batch.push(this.state.storage.put('initialized', true));
      await Promise.all(batch);
    })();
    return this.ready;
  }

  async fetch(request) {
    await this.ensureLoaded();
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/products') {
        const products = await this.list();
        return json({ success: true, products });
      }

      if (request.method === 'PUT' && url.pathname === '/products') {
        const body = await request.json();
        const p = body?.product;
        if (!validProduct(p)) return json({ error: 'Invalid product' }, 400);
        p.name = p.name.trim();
        p.updatedAt = new Date().toISOString();
        const current = await this.list();
        if (current.length >= 5000 && !current.some(x => x.id === p.id)) {
          return json({ error: 'Maximum 5000 products' }, 400);
        }
        await this.state.storage.put(`product:${p.id}`, p);
        return json({ success: true, product: p });
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/products/')) {
        const id = decodeURIComponent(url.pathname.slice('/products/'.length));
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return json({ error: 'Invalid product ID' }, 400);
        await this.state.storage.delete(`product:${id}`);
        return json({ success: true, productId: id });
      }

      if (request.method === 'POST' && url.pathname === '/products/checkout') {
        const body = await request.json();
        const items = Array.isArray(body?.items) ? body.items : [];
        if (!items.length || items.length > 100) return json({ error: 'Invalid checkout items' }, 400);

        // Aggregate duplicate product IDs first so each product is decremented once.
        const quantities = new Map();
        for (const item of items) {
          if (typeof item?.productId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.productId)) {
            return json({ error: 'Invalid checkout item' }, 400);
          }
          const qty = Number(item.qty);
          if (!Number.isSafeInteger(qty) || qty <= 0) return json({ error: 'Invalid checkout item' }, 400);
          quantities.set(item.productId, (quantities.get(item.productId) || 0) + qty);
        }

        const changes = [];
        for (const [id, qty] of quantities) {
          const p = await this.state.storage.get(`product:${id}`);
          if (!validProduct(p)) return json({ error: `Product not found: ${id}` }, 404);
          if (p.stock < qty) return json({ error: `Insufficient stock: ${p.name}` }, 409);
          p.stock -= qty;
          p.updatedAt = new Date().toISOString();
          changes.push({ product: p, productId: id, stock: p.stock });
        }

        // Durable Object execution is serialized per user. Writes happen only
        // after every item passes validation, so a failed checkout changes nothing.
        await Promise.all(changes.map(x => this.state.storage.put(`product:${x.productId}`, x.product)));
        return json({ success: true, updated: changes.map(x => ({ productId: x.productId, stock: x.stock })) });
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('InventoryDO error', error);
      return json({ error: 'Inventory operation failed' }, 500);
    }
  }

  async list() {
    const out = [];
    let cursor;
    do {
      const page = await this.state.storage.list({ prefix: 'product:', cursor });
      for (const value of page.values()) if (validProduct(value)) out.push(value);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  }
}

function validProduct(p) {
  return !!p && typeof p === 'object' && typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(p.id) &&
    typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 100 &&
    Number.isSafeInteger(Number(p.price)) && Number(p.price) > 0 && Number(p.price) <= 1e15 &&
    Number.isSafeInteger(Number(p.stock)) && Number(p.stock) >= 0 && Number(p.stock) <= 1e9;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
