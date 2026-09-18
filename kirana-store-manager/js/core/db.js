/**
 * Storage layer.
 *
 * One tiny adapter interface with two implementations:
 *   - IndexedDB (browser, offline-first, survives refresh)
 *   - in-memory (Node tests, and a fallback if IndexedDB is unavailable)
 *
 * Every multi-record write goes through `batch()`, which commits all operations
 * in a SINGLE transaction. That is what keeps a sale + its items + the stock
 * movement + the product row from ever disagreeing with each other.
 */

export const STORES = [
  'products',
  'categories',
  'customers',
  'suppliers',
  'sales',
  'sale_items',
  'returns',
  'purchases',
  'purchase_items',
  'payments',
  'expenses',
  'stock_movements',
  'settings',
  'meta',
];

const INDEXES = {
  sale_items: [['bySale', 'saleId'], ['byProduct', 'productId']],
  purchase_items: [['byPurchase', 'purchaseId'], ['byProduct', 'productId']],
  stock_movements: [['byProduct', 'productId'], ['byDate', 'date']],
  payments: [['byParty', 'partyId']],
  sales: [['byDate', 'date']],
  purchases: [['byDate', 'date'], ['bySupplier', 'supplierId']],
  expenses: [['byDate', 'date']],
  returns: [['bySale', 'saleId']],
};

/* ------------------------------------------------------------------ memory */

export function createMemoryAdapter() {
  const tables = new Map(STORES.map((s) => [s, new Map()]));
  const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

  return {
    kind: 'memory',
    async getAll(store) {
      requireStore(store);
      return [...tables.get(store).values()].map(clone);
    },
    async get(store, id) {
      requireStore(store);
      const v = tables.get(store).get(id);
      return v === undefined ? undefined : clone(v);
    },
    /** ops: [{op:'put', store, value}] | [{op:'del', store, id}] */
    async batch(ops) {
      // Validate everything BEFORE applying anything, so a bad op leaves no
      // partial write behind.
      const staged = ops.map((o) => {
        requireStore(o.store);
        const table = tables.get(o.store);
        if (o.op === 'put') {
          if (!o.value || typeof o.value.id !== 'string') {
            throw new Error(`batch put into "${o.store}" needs a record with an id`);
          }
          return () => table.set(o.value.id, clone(o.value));
        }
        if (o.op === 'del') {
          return () => table.delete(o.id);
        }
        throw new Error(`Unknown batch op: ${o.op}`);
      });
      staged.forEach((fn) => fn());
    },
    async clearAll() {
      tables.forEach((t) => t.clear());
    },
  };
}

/* ----------------------------------------------------------------- IndexedDB */

export function createIDBAdapter(dbName = 'kirana-store-manager', version = 1) {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available in this browser');

  const openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (db.objectStoreNames.contains(store)) continue;
        const os = db.createObjectStore(store, { keyPath: 'id' });
        for (const [name, keyPath] of INDEXES[store] || []) {
          if (!os.indexNames.contains(name)) os.createIndex(name, keyPath, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked — close other tabs of this app'));
  });

  const withDB = async (fn) => fn(await openPromise);

  return {
    kind: 'indexeddb',
    async getAll(store) {
      requireStore(store);
      return withDB(
        (db) =>
          new Promise((resolve, reject) => {
            const req = db.transaction(store, 'readonly').objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
          }),
      );
    },
    async get(store, id) {
      requireStore(store);
      return withDB(
        (db) =>
          new Promise((resolve, reject) => {
            const req = db.transaction(store, 'readonly').objectStore(store).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          }),
      );
    },
    async batch(ops) {
      if (ops.length === 0) return;
      const stores = [...new Set(ops.map((o) => o.store))];
      stores.forEach(requireStore);
      await withDB(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(stores, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Write failed'));
            tx.onabort = () => reject(tx.error || new Error('Write aborted'));
            // Issue every request synchronously — an `await` in here would let
            // the transaction auto-commit halfway through.
            for (const o of ops) {
              const os = tx.objectStore(o.store);
              if (o.op === 'put') {
                if (!o.value || typeof o.value.id !== 'string') {
                  tx.abort();
                  reject(new Error(`batch put into "${o.store}" needs a record with an id`));
                  return;
                }
                os.put(o.value);
              } else if (o.op === 'del') {
                os.delete(o.id);
              } else {
                tx.abort();
                reject(new Error(`Unknown batch op: ${o.op}`));
                return;
              }
            }
          }),
      );
    },
    async clearAll() {
      await withDB(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORES, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Clear aborted'));
            for (const store of STORES) tx.objectStore(store).clear();
          }),
      );
    },
  };
}

/* ------------------------------------------------------------------- helpers */

function requireStore(store) {
  if (!STORES.includes(store)) throw new Error(`Unknown object store: ${store}`);
}

/**
 * Collects writes and commits them atomically.
 *
 *   const b = batch(db);
 *   b.put('products', product);
 *   b.del('expenses', id);
 *   await b.commit();
 */
export function batch(db) {
  const ops = [];
  return {
    /** The queued operations — exposed so callers can mirror them into a cache. */
    get ops() {
      return ops;
    },
    put(store, value) {
      ops.push({ op: 'put', store, value });
      return this;
    },
    del(store, id) {
      ops.push({ op: 'del', store, id });
      return this;
    },
    get size() {
      return ops.length;
    },
    commit() {
      return db.batch(ops);
    },
  };
}

/** Error carrying a user-facing validation message. */
export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}
