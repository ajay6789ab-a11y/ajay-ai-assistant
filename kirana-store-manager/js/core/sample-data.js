/**
 * Optional demo data.
 *
 * Lets a new shopkeeper see a populated app in one tap instead of an empty
 * screen. It goes through exactly the same public API as real usage, so it
 * cannot create records the rest of the app would reject.
 */

import { uid, nowISO } from './ids.js';

export async function loadSampleData(store) {
  const suppliers = [
    await store.saveSupplier({ name: 'Sharma Wholesale', mobile: '9810012345', address: 'Azadpur Mandi, Delhi' }),
    await store.saveSupplier({ name: 'Verma Dairy Distributors', mobile: '9810067890', address: 'Karnal Road' }),
  ];

  const products = [
    await store.saveProduct({ name: 'Basmati Rice', category: 'Grocery', brand: 'India Gate', sku: '8901234500011', purchasePrice: '80', sellingPrice: '100', mrp: '110', unit: 'kg', minStock: '5', supplierId: suppliers[0].id }),
    await store.saveProduct({ name: 'Sunflower Oil 1L', category: 'Grocery', brand: 'Fortune', sku: '8901234500028', purchasePrice: '140', sellingPrice: '170', mrp: '180', unit: 'litre', minStock: '3', supplierId: suppliers[0].id }),
    await store.saveProduct({ name: 'Toor Dal', category: 'Grocery', sku: '8901234500035', purchasePrice: '130', sellingPrice: '160', mrp: '170', unit: 'kg', minStock: '4', supplierId: suppliers[0].id }),
    await store.saveProduct({ name: 'Amul Butter 500g', category: 'Dairy', brand: 'Amul', sku: '8901234500042', purchasePrice: '245', sellingPrice: '280', mrp: '290', unit: 'piece', minStock: '6', supplierId: suppliers[1].id }),
    await store.saveProduct({ name: 'Full Cream Milk 1L', category: 'Dairy', brand: 'Amul', sku: '8901234500059', purchasePrice: '58', sellingPrice: '66', mrp: '68', unit: 'litre', minStock: '10', supplierId: suppliers[1].id }),
    await store.saveProduct({ name: 'Parle-G Biscuit', category: 'Snacks', brand: 'Parle', sku: '8901234500066', purchasePrice: '8', sellingPrice: '10', mrp: '10', unit: 'packet', minStock: '24', supplierId: suppliers[0].id }),
    await store.saveProduct({ name: 'Tata Salt 1kg', category: 'Grocery', brand: 'Tata', sku: '8901234500073', purchasePrice: '24', sellingPrice: '28', mrp: '30', unit: 'packet', minStock: '10', supplierId: suppliers[0].id }),
    await store.saveProduct({ name: 'Sugar', category: 'Grocery', sku: '8901234500080', purchasePrice: '42', sellingPrice: '50', mrp: '52', unit: 'kg', minStock: '8', supplierId: suppliers[0].id }),
  ];

  const customers = [
    await store.saveCustomer({ name: 'Ramesh Kumar', mobile: '9876543210', address: 'Shop No 4, Block C' }),
    await store.saveCustomer({ name: 'Sunita Devi', mobile: '9876500011', address: 'House 221, Lane 6' }),
    await store.saveCustomer({ name: 'Imran Ansari', mobile: '9876522233', address: 'Near Masjid' }),
  ];

  // Opening purchases — this is what puts stock on the shelf.
  await store.createPurchase({
    supplierId: suppliers[0].id,
    invoiceNo: 'SW-1042',
    amountPaid: '5000',          // part payment — total is ₹8,870, so this stays "partial"
    items: [
      { productId: products[0].id, qty: '40', rate: '80' },
      { productId: products[1].id, qty: '12', rate: '140' },
      { productId: products[2].id, qty: '15', rate: '130' },
      { productId: products[5].id, qty: '60', rate: '8' },
      { productId: products[6].id, qty: '30', rate: '24' },
      { productId: products[7].id, qty: '20', rate: '42' },
    ],
  });
  await store.createPurchase({
    supplierId: suppliers[1].id,
    invoiceNo: 'VD-331',
    amountPaid: '0',
    items: [
      { productId: products[3].id, qty: '20', rate: '245' },
      { productId: products[4].id, qty: '30', rate: '58' },
    ],
  });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  await store.createSale({ paymentMode: 'cash', items: [{ productId: products[0].id, qty: '5' }, { productId: products[7].id, qty: '2' }] });
  await store.createSale({ paymentMode: 'upi', items: [{ productId: products[1].id, qty: '2' }, { productId: products[5].id, qty: '6' }] });
  await store.createSale({ paymentMode: 'credit', customerId: customers[0].id, items: [{ productId: products[0].id, qty: '10' }, { productId: products[2].id, qty: '3' }] });
  await store.createSale({ paymentMode: 'credit', customerId: customers[1].id, items: [{ productId: products[3].id, qty: '2' }, { productId: products[4].id, qty: '4' }] });
  await store.createSale({ paymentMode: 'cash', date: yesterday.toISOString(), items: [{ productId: products[6].id, qty: '4' }, { productId: products[5].id, qty: '10' }] });

  // A part-payment against udhaar, so the ledger has both sides.
  await store.recordPayment({ partyType: 'customer', partyId: customers[0].id, amount: '500', mode: 'upi' });

  await store.saveExpense({ category: 'electricity', amount: '1450', note: 'September meter' });
  await store.saveExpense({ category: 'rent', amount: '12000', note: 'Shop rent' });
  await store.saveExpense({ category: 'transport', amount: '600', note: 'Mandi loading' });

  return { products: products.length, customers: customers.length, suppliers: suppliers.length };
}

/** A single random-ish record id, exposed for tooling. */
export const sampleId = uid;
export const sampleNow = nowISO;
