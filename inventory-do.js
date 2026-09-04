// ==========================================
// NEXA - ATOMIC INVENTORY DURABLE OBJECT
// ==========================================
// One Durable Object instance owns one user's inventory. Durable Object
// requests for the same user are serialized, so checkout stock checks and
// decrements cannot race with another checkout for that user.

export class InventoryDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ready = null;
  }

  async ensureLoaded(request) {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const requestedUserId = request?.headers?.get('X-Inventory-User') || '';
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(requestedUserId)) {
        throw new Error('Missing or invalid inventory user ID');
      }

      const storedUserId = await this.state.storage.get('userId');
      if (storedUserId && storedUserId !== requestedUserId) {
        throw new Error('Inventory user mismatch');
      }

      if (await this.state.storage.get('initialized')) {
        if (!storedUserId) await this.state.storage.put('userId', requestedUserId);
        return;
      }

      // Migrate legacy KV products exactly once. The router maps one DO to
      // one application user and forwards that user ID in a trusted header.
      const prefix = `product:${requestedUserId}:`;
      const page = await this.env.PEMBUKUAN_KV.list({ prefix, limit: 5000 });
      if (!page.list_complete) throw new Error('Inventory migration exceeds supported KV page size');

      const products = [];
      const values = await Promise.all(page.keys.map(k => this.env.PEMBUKUAN_KV.get(k.name)));
      values.forEach(raw => {
        if (!raw) return;
        try {
          const p = JSON.parse(raw);
          if (validProduct(p)) products.push(p);
        } catch {}
      });

      await this.state.storage.transaction(async txn => {
        for (const p of products) await txn.put(`product:${p.id}`, p);
        await txn.put('userId', requestedUserId);
        await txn.put('initialized', true);
      });
    })();
    return this.ready;
  }

  async fetch(request) {
    try {
      await this.ensureLoaded(request);
    } catch (error) {
      console.error('Inventory initialization failed', error);
      return json({ error: 'Inventory initialization failed' }, 500);
    }

    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/products') {
        return json({ success: true, products: await this.list() });
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

        const quantities = new Map();
        for (const item of items) {
          if (typeof item?.productId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.productId)) {
            return json({ error: 'Invalid checkout item' }, 400);
          }
          const qty = Number(item.qty);
          if (!Number.isSafeInteger(qty) || qty <= 0) return json({ error: 'Invalid checkout item' }, 400);
          const total = (quantities.get(item.productId) || 0) + qty;
          if (!Number.isSafeInteger(total) || total > 1e9) return json({ error: 'Invalid checkout quantity' }, 400);
          quantities.set(item.productId, total);
        }

        // Use a storage transaction as well as the DO's request serialization.
        // Validation and all stock writes therefore commit or roll back together.
        let updated;
        try {
          updated = await this.state.storage.transaction(async txn => {
            const changes = [];
            for (const [id, qty] of quantities) {
              const p = await txn.get(`product:${id}`);
              if (!validProduct(p)) throw new InventoryError(`Product not found: ${id}`, 404);
              if (p.stock < qty) throw new InventoryError(`Insufficient stock: ${p.name}`, 409);
              const next = { ...p, stock: p.stock - qty, updatedAt: new Date().toISOString() };
              changes.push({ productId: id, product: next, stock: next.stock });
            }
            for (const change of changes) await txn.put(`product:${change.productId}`, change.product);
            return changes.map(({ productId, stock }) => ({ productId, stock }));
          });
        } catch (error) {
          if (error instanceof InventoryError) return json({ error: error.message }, error.status);
          throw error;
        }

        return json({ success: true, updated });
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('InventoryDO error', error);
      return json({ error: 'Inventory operation failed' }, 500);
    }
  }

  async list() {
    const out = [];
    const page = await this.state.storage.list({ prefix: 'product:' });
    for (const value of page.values()) if (validProduct(value)) out.push(value);
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  }
}

class InventoryError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'InventoryError';
    this.status = status;
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
