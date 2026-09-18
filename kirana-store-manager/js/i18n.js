/**
 * English / Hindi strings.
 *
 * Default language is English; the toggle in Settings switches at runtime and
 * the choice is stored with the shop settings. Every user-visible string in the
 * app goes through t() so nothing is hard-coded in the screens.
 */

export const STRINGS = {
  en: {
    appName: 'Kirana Store Manager',
    tagline: 'Free · Offline · Yours',

    nav: { dashboard: 'Dashboard', sales: 'Sales', products: 'Products', customers: 'Customers', more: 'More' },
    action: { newSale: 'Sale', add: 'Add', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
      close: 'Close', back: 'Back', search: 'Search', clear: 'Clear', print: 'Print', share: 'Share',
      export: 'Export', import: 'Import', reset: 'Reset data', confirm: 'Confirm', unlock: 'Unlock',
      setPin: 'Set PIN', changePin: 'Change PIN', removePin: 'Remove PIN', scan: 'Scan barcode',
      manualEntry: 'Enter barcode manually', return: 'Return', void: 'Cancel bill', addPayment: 'Add payment',
      viewLedger: 'Ledger', history: 'Stock history', apply: 'Apply', download: 'Download' },

    dashboard: {
      title: 'Dashboard', todaySales: "Today's sales", purchases: 'Purchases', grossProfit: 'Gross profit',
      netProfit: 'Net profit', expenses: 'Expenses', cashSales: 'Cash', upiSales: 'UPI', creditSales: 'Credit / Udhaar',
      customerDues: 'Customer dues', collections: 'Collections', lowStock: 'Low stock', outOfStock: 'Out of stock',
      recent: 'Recent transactions', topProducts: 'Top selling', supplierPayable: 'Supplier payable',
      bills: 'bills', range: 'Period', noData: 'No transactions in this period yet.',
      noStockAlerts: 'Stock levels look healthy.',
    },
    range: { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month', custom: 'Custom' },

    sale: {
      title: 'New sale', editTitle: 'Bill', product: 'Product', qty: 'Qty', price: 'Price', discount: 'Discount',
      total: 'Total', subtotal: 'Subtotal', grandTotal: 'Grand total', paymentMode: 'Payment',
      cash: 'Cash', upi: 'UPI', credit: 'Credit / Udhaar', customer: 'Customer', walkIn: 'Walk-in customer',
      newCustomer: 'New customer', advance: 'Advance received', addItem: 'Add item', empty: 'Add a product to start the bill.',
      complete: 'Complete sale', billNo: 'Bill no', date: 'Date', invoice: 'Invoice', returned: 'Returned',
      voided: 'Cancelled', returns: 'Returns', noBills: 'No bills yet. Tap “Sale” to make the first one.',
      returnTitle: 'Return items', returnReason: 'Reason', confirmReturn: 'Confirm return',
      voidReason: 'Reason for cancelling', confirmVoid: 'Cancel this bill',
      searchPlaceholder: 'Search product, SKU or barcode…',
      paidInFull: 'Paid in full', stockLeft: 'in stock',
    },

    product: {
      title: 'Products', name: 'Product name', category: 'Category', brand: 'Brand', sku: 'SKU / Barcode',
      purchasePrice: 'Purchase price', sellingPrice: 'Selling price', mrp: 'MRP', stock: 'Current stock',
      minStock: 'Minimum stock', unit: 'Unit', supplier: 'Supplier', expiry: 'Expiry date', notes: 'Notes',
      openingStock: 'Opening stock', adjustNote: 'Adjustment note', addTitle: 'Add product', editTitle: 'Edit product',
      filterAll: 'All', filterLow: 'Low stock', filterOut: 'Out of stock', empty: 'No products yet. Add your first item.',
      noResults: 'Nothing matched that search.', deleteConfirm: 'Delete this product?',
      movement: { opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale', sale_return: 'Sale return',
        sale_void: 'Bill cancelled', purchase_return: 'Returned to supplier', adjustment: 'Manual adjustment' },
    },

    customer: {
      title: 'Customers', name: 'Name', mobile: 'Mobile', address: 'Address', notes: 'Notes',
      addTitle: 'Add customer', editTitle: 'Edit customer', outstanding: 'Outstanding', paid: 'Paid',
      billed: 'Total billed', ledger: 'Ledger', statement: 'Statement', empty: 'No customers yet.',
      noDues: 'No pending udhaar. ', payment: 'Payment received', refund: 'Refund',
      noLedger: 'No transactions with this customer yet.', allSettled: 'All settled',
    },

    supplier: {
      title: 'Suppliers', name: 'Name', mobile: 'Mobile', address: 'Address', notes: 'Notes',
      addTitle: 'Add supplier', editTitle: 'Edit supplier', payable: 'Payable', empty: 'No suppliers yet.',
    },

    purchase: {
      title: 'Purchases', newTitle: 'New purchase', supplier: 'Supplier', invoiceNo: 'Invoice no',
      rate: 'Rate', amountPaid: 'Amount paid', total: 'Total', paymentStatus: 'Payment',
      paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', empty: 'No purchases yet.',
      returnTitle: 'Return to supplier', add: 'New purchase', stockWillIncrease: 'Saving will increase stock.',
    },

    expense: {
      title: 'Expenses', category: 'Category', amount: 'Amount', note: 'Note', date: 'Date',
      addTitle: 'Add expense', empty: 'No expenses recorded.',
      categories: { electricity: 'Electricity', rent: 'Rent', transport: 'Transport', salary: 'Salary',
        packaging: 'Packaging', maintenance: 'Maintenance', other: 'Other' },
    },

    reports: {
      title: 'Reports', sales: 'Sales report', purchases: 'Purchase report', expenses: 'Expense report',
      stock: 'Stock report', dues: 'Customer dues', payables: 'Supplier payables', profit: 'Profit summary',
      revenue: 'Sales revenue', cogs: 'Cost of sold items', gross: 'Gross profit', net: 'Net profit',
      exportCsv: 'Export CSV', exportJson: 'Export JSON', product: 'Product', qty: 'Qty', amount: 'Amount',
      profitCol: 'Profit', nothing: 'Nothing to show for this period.',
    },

    backup: {
      title: 'Backup & restore', exportAll: 'Export all data (JSON)', importAll: 'Import / restore JSON',
      mergeHint: 'Import adds and updates records without deleting anything.',
      replaceHint: 'Import replaces everything with the backup file.',
      merge: 'Merge into existing data', replace: 'Replace all data',
      resetTitle: 'Delete all data', resetWarn: 'This deletes every product, bill, customer and expense from this device. Export a backup first.',
      resetConfirm: 'Type DELETE to confirm', lastExport: 'Last backup', never: 'never',
      restored: 'Backup restored', exported: 'Backup downloaded', resetDone: 'All data deleted',
    },

    settings: {
      title: 'Settings', shopName: 'Shop name', ownerName: 'Owner name', mobile: 'Mobile', address: 'Address',
      gstin: 'GSTIN (optional)', invoicePrefix: 'Invoice prefix', currency: 'Currency symbol',
      language: 'Language', negativeStock: 'Allow selling more than available stock',
      security: 'Security', about: 'About', version: 'Version', dataTools: 'Data tools',
      recalcStock: 'Recalculate stock from history', recalced: 'Stock recalculated',
      loadSample: 'Load sample data', sampleWarn: 'This adds demo products, customers, bills and expenses on top of whatever is already here.',
      integrityOk: 'Stock history matches current stock.', integrityBad: 'records needed fixing.',
      pinPrompt: 'Enter a 4–6 digit PIN', pinRepeat: 'Re-enter the PIN', pinMismatch: 'PINs do not match',
      pinWrong: 'Wrong PIN', pinSet: 'PIN lock enabled', pinRemoved: 'PIN lock removed',
      currentPin: 'Current PIN', english: 'English', hindi: 'हिन्दी',
    },

    lock: { title: 'Locked', subtitle: 'Enter your PIN to open the app', wrong: 'Wrong PIN, try again' },

    errors: { required: 'This field is required', invalid: 'Invalid value', networkFree: 'This app works fully offline.' },
    toast: { saved: 'Saved', deleted: 'Deleted', saleDone: 'Bill saved', purchaseDone: 'Purchase saved',
      returnDone: 'Return recorded', voidDone: 'Bill cancelled', paymentDone: 'Payment recorded',
      copied: 'Copied to clipboard', shared: 'Shared', unsupported: 'Sharing is not supported on this browser' },
  },

  hi: {
    appName: 'किराना स्टोर मैनेजर',
    tagline: 'मुफ़्त · ऑफ़लाइन · आपका',

    nav: { dashboard: 'होम', sales: 'बिक्री', products: 'सामान', customers: 'ग्राहक', more: 'और' },
    action: { newSale: 'बिल', add: 'जोड़ें', save: 'सेव', cancel: 'रद्द', delete: 'हटाएँ', edit: 'बदलें',
      close: 'बंद', back: 'वापस', search: 'खोजें', clear: 'साफ़', print: 'प्रिंट', share: 'शेयर',
      export: 'निकालें', import: 'अंदर लें', reset: 'डेटा मिटाएँ', confirm: 'पक्का करें', unlock: 'खोलें',
      setPin: 'पिन लगाएँ', changePin: 'पिन बदलें', removePin: 'पिन हटाएँ', scan: 'बारकोड स्कैन',
      manualEntry: 'बारकोड खुद लिखें', return: 'वापसी', void: 'बिल रद्द', addPayment: 'पैसे जमा',
      viewLedger: 'खाता', history: 'स्टॉक इतिहास', apply: 'लागू करें', download: 'डाउनलोड' },

    dashboard: {
      title: 'होम', todaySales: 'आज की बिक्री', purchases: 'खरीद', grossProfit: 'कुल मुनाफ़ा',
      netProfit: 'शुद्ध मुनाफ़ा', expenses: 'खर्च', cashSales: 'नकद', upiSales: 'यूपीआई', creditSales: 'उधार',
      customerDues: 'ग्राहक उधारी', collections: 'वसूली', lowStock: 'कम स्टॉक', outOfStock: 'स्टॉक ख़त्म',
      recent: 'हाल के लेन-देन', topProducts: 'सबसे ज़्यादा बिकने वाला', supplierPayable: 'सप्लायर को देना',
      bills: 'बिल', range: 'अवधि', noData: 'इस अवधि में कोई लेन-देन नहीं।',
      noStockAlerts: 'स्टॉक ठीक है।',
    },
    range: { today: 'आज', yesterday: 'कल', week: 'इस हफ़्ते', month: 'इस महीने', custom: 'तय करें' },

    sale: {
      title: 'नया बिल', editTitle: 'बिल', product: 'सामान', qty: 'मात्रा', price: 'दाम', discount: 'छूट',
      total: 'कुल', subtotal: 'उप-कुल', grandTotal: 'कुल बिल', paymentMode: 'भुगतान',
      cash: 'नकद', upi: 'यूपीआई', credit: 'उधार', customer: 'ग्राहक', walkIn: 'आम ग्राहक',
      newCustomer: 'नया ग्राहक', advance: 'पेशगी ली', addItem: 'सामान जोड़ें', empty: 'बिल शुरू करने के लिए सामान जोड़ें।',
      complete: 'बिल पूरा करें', billNo: 'बिल नं', date: 'तारीख़', invoice: 'बिल', returned: 'वापस',
      voided: 'रद्द', returns: 'वापसी', noBills: 'अभी कोई बिल नहीं। “बिल” दबाएँ।',
      returnTitle: 'सामान वापस', returnReason: 'वजह', confirmReturn: 'वापसी पक्की करें',
      voidReason: 'रद्द करने की वजह', confirmVoid: 'यह बिल रद्द करें',
      searchPlaceholder: 'सामान, SKU या बारकोड खोजें…',
      paidInFull: 'पूरा भुगतान', stockLeft: 'स्टॉक में',
    },

    product: {
      title: 'सामान', name: 'सामान का नाम', category: 'श्रेणी', brand: 'ब्रांड', sku: 'SKU / बारकोड',
      purchasePrice: 'खरीद दाम', sellingPrice: 'बिक्री दाम', mrp: 'एमआरपी', stock: 'मौजूदा स्टॉक',
      minStock: 'न्यूनतम स्टॉक', unit: 'इकाई', supplier: 'सप्लायर', expiry: 'एक्सपायरी', notes: 'टिप्पणी',
      openingStock: 'शुरुआती स्टॉक', adjustNote: 'बदलाव की वजह', addTitle: 'सामान जोड़ें', editTitle: 'सामान बदलें',
      filterAll: 'सभी', filterLow: 'कम स्टॉक', filterOut: 'स्टॉक ख़त्म', empty: 'अभी कोई सामान नहीं। पहला सामान जोड़ें।',
      noResults: 'इस खोज से कुछ नहीं मिला।', deleteConfirm: 'यह सामान हटाएँ?',
      movement: { opening: 'शुरुआती स्टॉक', purchase: 'खरीद', sale: 'बिक्री', sale_return: 'बिक्री वापसी',
        sale_void: 'बिल रद्द', purchase_return: 'सप्लायर को वापस', adjustment: 'खुद बदलाव' },
    },

    customer: {
      title: 'ग्राहक', name: 'नाम', mobile: 'मोबाइल', address: 'पता', notes: 'टिप्पणी',
      addTitle: 'ग्राहक जोड़ें', editTitle: 'ग्राहक बदलें', outstanding: 'बाकी', paid: 'जमा',
      billed: 'कुल बिल', ledger: 'खाता', statement: 'बयान', empty: 'अभी कोई ग्राहक नहीं।',
      noDues: 'कोई उधारी बाकी नहीं। ', payment: 'पैसे जमा', refund: 'वापसी',
      noLedger: 'इस ग्राहक से अभी कोई लेन-देन नहीं।', allSettled: 'हिसाब बराबर',
    },

    supplier: {
      title: 'सप्लायर', name: 'नाम', mobile: 'मोबाइल', address: 'पता', notes: 'टिप्पणी',
      addTitle: 'सप्लायर जोड़ें', editTitle: 'सप्लायर बदलें', payable: 'देना बाकी', empty: 'अभी कोई सप्लायर नहीं।',
    },

    purchase: {
      title: 'खरीद', newTitle: 'नई खरीद', supplier: 'सप्लायर', invoiceNo: 'इनवॉइस नं',
      rate: 'भाव', amountPaid: 'दी गई रकम', total: 'कुल', paymentStatus: 'भुगतान',
      paid: 'चुकता', partial: 'आधा', unpaid: 'बाकी', empty: 'अभी कोई खरीद नहीं।',
      returnTitle: 'सप्लायर को वापस', add: 'नई खरीद', stockWillIncrease: 'सेव करने पर स्टॉक बढ़ेगा।',
    },

    expense: {
      title: 'खर्च', category: 'श्रेणी', amount: 'रकम', note: 'टिप्पणी', date: 'तारीख़',
      addTitle: 'खर्च जोड़ें', empty: 'कोई खर्च दर्ज नहीं।',
      categories: { electricity: 'बिजली', rent: 'किराया', transport: 'ढुलाई', salary: 'तनख़्वाह',
        packaging: 'पैकिंग', maintenance: 'मरम्मत', other: 'अन्य' },
    },

    reports: {
      title: 'रिपोर्ट', sales: 'बिक्री रिपोर्ट', purchases: 'खरीद रिपोर्ट', expenses: 'खर्च रिपोर्ट',
      stock: 'स्टॉक रिपोर्ट', dues: 'ग्राहक उधारी', payables: 'सप्लायर देय', profit: 'मुनाफ़ा सारांश',
      revenue: 'बिक्री राजस्व', cogs: 'बिके सामान की लागत', gross: 'कुल मुनाफ़ा', net: 'शुद्ध मुनाफ़ा',
      exportCsv: 'CSV निकालें', exportJson: 'JSON निकालें', product: 'सामान', qty: 'मात्रा', amount: 'रकम',
      profitCol: 'मुनाफ़ा', nothing: 'इस अवधि के लिए कुछ नहीं।',
    },

    backup: {
      title: 'बैकअप और रीस्टोर', exportAll: 'सारा डेटा निकालें (JSON)', importAll: 'JSON से रीस्टोर करें',
      mergeHint: 'यह मौजूदा डेटा में जोड़ता है, कुछ मिटाता नहीं।',
      replaceHint: 'यह सब कुछ बैकअप फ़ाइल से बदल देता है।',
      merge: 'मौजूदा डेटा में मिलाएँ', replace: 'सारा डेटा बदलें',
      resetTitle: 'सारा डेटा मिटाएँ', resetWarn: 'इससे इस डिवाइस का हर सामान, बिल, ग्राहक और खर्च मिट जाएगा। पहले बैकअप लें।',
      resetConfirm: 'पक्का करने के लिए DELETE लिखें', lastExport: 'आख़िरी बैकअप', never: 'कभी नहीं',
      restored: 'बैकअप रीस्टोर हो गया', exported: 'बैकअप डाउनलोड हो गया', resetDone: 'सारा डेटा मिट गया',
    },

    settings: {
      title: 'सेटिंग', shopName: 'दुकान का नाम', ownerName: 'मालिक का नाम', mobile: 'मोबाइल', address: 'पता',
      gstin: 'GSTIN (वैकल्पिक)', invoicePrefix: 'बिल उपसर्ग', currency: 'मुद्रा चिह्न',
      language: 'भाषा', negativeStock: 'स्टॉक से ज़्यादा बेचने दें',
      security: 'सुरक्षा', about: 'जानकारी', version: 'संस्करण', dataTools: 'डेटा टूल्स',
      recalcStock: 'इतिहास से स्टॉक फिर गिनें', recalced: 'स्टॉक फिर गिना गया',
      loadSample: 'नमूना डेटा भरें', sampleWarn: 'यह मौजूदा डेटा के ऊपर डेमो सामान, ग्राहक, बिल और खर्च जोड़ देगा।',
      integrityOk: 'स्टॉक इतिहास और मौजूदा स्टॉक बराबर हैं।', integrityBad: 'रिकॉर्ड ठीक करने पड़े।',
      pinPrompt: '4–6 अंकों का पिन डालें', pinRepeat: 'पिन दोबारा डालें', pinMismatch: 'दोनों पिन मिलते नहीं',
      pinWrong: 'गलत पिन', pinSet: 'पिन लॉक चालू', pinRemoved: 'पिन लॉक हट गया',
      currentPin: 'मौजूदा पिन', english: 'English', hindi: 'हिन्दी',
    },

    lock: { title: 'बंद है', subtitle: 'ऐप खोलने के लिए पिन डालें', wrong: 'गलत पिन, फिर कोशिश करें' },

    errors: { required: 'यह ज़रूरी है', invalid: 'गलत मान', networkFree: 'यह ऐप पूरी तरह ऑफ़लाइन चलता है।' },
    toast: { saved: 'सेव हो गया', deleted: 'हट गया', saleDone: 'बिल सेव हो गया', purchaseDone: 'खरीद सेव हो गई',
      returnDone: 'वापसी दर्ज हो गई', voidDone: 'बिल रद्द हो गया', paymentDone: 'भुगतान दर्ज हो गया',
      copied: 'क्लिपबोर्ड पर कॉपी', shared: 'शेयर हो गया', unsupported: 'यह ब्राउज़र शेयरिंग नहीं करता' },
  },
};

let lang = 'en';

export function setLanguage(next) {
  lang = next === 'hi' ? 'hi' : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }
}

export function getLanguage() {
  return lang;
}

/**
 * t('sale.total') → "Total" / "कुल"
 * Falls back to English, then to the key itself, so a missing string never
 * shows "undefined" on screen.
 */
export function t(path) {
  const pick = (dict) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
  const value = pick(STRINGS[lang]) ?? pick(STRINGS.en);
  return value === undefined ? path : value;
}

/** Apply data-i18n attributes across a subtree (used after a language switch). */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  }
}
