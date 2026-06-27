/**
 * POS Billing Terminal Module for Inventra Enterprise ERP
 */
class POSModule {
  constructor() {
    this.cart = [];
    this.products = [];
    this.categories = [];
    this.selectedCustomer = null;
    this.activeCategory = '';
  }

  async render(subModule, query, container) {
    if (subModule === 'bills') {
      return this.renderBillsHistory(container);
    }
    
    // Default: POS Terminal Grid
    return this.renderTerminal(container);
  }

  // ─── POS Billing Terminal Screen ─────────────────────────────────────────────
  async renderTerminal(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="row g-3">
          
          <!-- Left Panel: Product Grid -->
          <div class="col-12 col-xl-7 col-xxl-8">
            <div class="glass-card card-glow p-3 mb-3 d-flex gap-2 align-items-center">
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-upc-scan"></i></span>
                <input type="text" id="posBarcodeField" class="form-control form-control-lg text-glow" placeholder="Scan barcode or type SKU... (F2 to focus)" autofocus>
              </div>
              <button class="btn btn-lg btn-outline-primary" id="posFilterBtn"><i class="bi bi-filter"></i></button>
            </div>

            <!-- Categories Tabs -->
            <div class="scroll-x gap-2 mb-3" id="posCategoriesBar">
              <button class="btn btn-sm btn-primary active cat-tab" data-cat="">All Items</button>
            </div>

            <!-- Products Grid -->
            <div class="pos-products-grid row row-cols-2 row-cols-md-3 row-cols-xxl-4 g-2" id="posProductsContainer" style="max-height: calc(100vh - 240px); overflow-y: auto; padding-right: 5px;">
              <!-- Loaded dynamically -->
            </div>
          </div>

          <!-- Right Panel: Cart & Payment Checkout Drawer -->
          <div class="col-12 col-xl-5 col-xxl-4">
            <div class="glass-card card-glow p-3 d-flex flex-column h-100" style="min-height: 520px; max-height: calc(100vh - 120px);">
              
              <!-- Customer Mapping Selector -->
              <div class="mb-3 border-bottom pb-2">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fw-semibold text-sm">Active Customer Mapping</span>
                  <button class="btn btn-xs btn-outline-primary" id="posAddCustBtn"><i class="bi bi-person-plus-fill"></i></button>
                </div>
                <select id="posCustomerSelect" class="form-select form-select-sm">
                  <option value="walkin">Walk-in Cash Customer</option>
                  <!-- Populated from CRM -->
                </select>
              </div>

              <!-- Cart Item List -->
              <div class="cart-items-list flex-grow-1 border-bottom" id="posCartItems" style="overflow-y: auto; min-height: 200px;">
                <div class="text-center py-5 text-muted" id="cartEmptyMsg">
                  <i class="bi bi-cart3 display-6 d-block mb-2"></i>
                  Cart is empty
                </div>
              </div>

              <!-- Cart Calculations -->
              <div class="cart-summary py-3 text-sm">
                <div class="d-flex justify-content-between mb-1">
                  <span class="text-muted">Subtotal (Excl. Tax)</span>
                  <span id="posSubtotal">₹0.00</span>
                </div>
                <div class="d-flex justify-content-between mb-1">
                  <span class="text-muted">Discount / Loyalty Schemes</span>
                  <span class="text-success" id="posDiscount">-₹0.00</span>
                </div>
                <div class="d-flex justify-content-between mb-1">
                  <span class="text-muted">Taxes (GST Rate Map)</span>
                  <span id="posTax">₹0.00</span>
                </div>
                <div class="d-flex justify-content-between mt-2 pt-2 border-top">
                  <h4 class="fw-bold mb-0">Total Pay</h4>
                  <h4 class="fw-bold mb-0 text-glow text-primary" id="posTotal">₹0.00</h4>
                </div>
              </div>

              <!-- Checkout Actions -->
              <div class="d-grid gap-2">
                <button class="btn btn-primary btn-lg" id="posCheckoutBtn" disabled>
                  <i class="bi bi-wallet2 me-2"></i>Collect Payment (F9)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Payment / Collect Dialog Modal -->
      <div class="modal fade" id="posCheckoutModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content glass-card">
            <div class="modal-header">
              <h5 class="modal-title fw-bold">Collect Payment</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
              <div class="text-center mb-4">
                <span class="text-muted">Total Payable Amount</span>
                <h2 class="display-5 fw-bold text-glow text-primary mt-1" id="checkoutAmount">₹0.00</h2>
              </div>
              <form id="posPaymentForm">
                <div class="mb-3">
                  <label class="form-label">Payment Mode</label>
                  <select id="payMode" class="form-select form-select-lg" required>
                    <option value="cash" selected>Cash</option>
                    <option value="card">Credit / Debit Card</option>
                    <option value="upi">UPI / Dynamic QR Code</option>
                    <option value="split">Split (Cash + Card)</option>
                  </select>
                </div>
                
                <!-- Cash Return helper -->
                <div id="cashReturnWrapper" class="row g-2 mb-3">
                  <div class="col-6">
                    <label class="form-label">Cash Tendered</label>
                    <input type="number" id="cashTendered" class="form-control form-control-lg" step="0.01">
                  </div>
                  <div class="col-6">
                    <label class="form-label">Balance Return</label>
                    <input type="text" id="cashReturn" class="form-control form-control-lg bg-light" readonly value="₹0.00">
                  </div>
                </div>

                <button type="submit" class="btn btn-primary btn-lg w-100 py-3 mt-2">
                  <span class="spinner-border spinner-border-sm me-2 d-none" id="checkoutSpinner"></span>
                  Confirm & Print Invoice
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    // Initialize logic
    this.cart = [];
    await this.initPOSData();
    this.setupPOSListeners();
  }

  async initPOSData() {
    try {
      const [prodsRes, catsRes, custsRes] = await Promise.all([
        window.api.get('/pos/products'),
        window.api.get('/categories'),
        window.api.get('/customers?limit=100')
      ]);

      if (prodsRes.success && prodsRes.data.products) {
        this.products = prodsRes.data.products;
      }
      if (catsRes.success && catsRes.data.categories) {
        this.categories = catsRes.data.categories;
      }
      
      // Load CRM customers
      const custSelect = document.getElementById('posCustomerSelect');
      if (custsRes.success && custsRes.data.customers) {
        custsRes.data.customers.forEach(c => {
          custSelect.innerHTML += `<option value="${c._id}">${c.name} (${c.phone})</option>`;
        });
      }

      // Populate Category list
      const catBar = document.getElementById('posCategoriesBar');
      this.categories.forEach(c => {
        catBar.innerHTML += `<button class="btn btn-sm btn-glass cat-tab" data-cat="${c._id}">${c.name}</button>`;
      });

      // Show default products
      this.filterProducts('');
    } catch (e) {
      console.error('POS Init failed:', e);
      window.app.showToast('Could not load POS catalogs.', 'danger');
    }
  }

  setupPOSListeners() {
    // Category tabs
    document.querySelectorAll('.cat-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active', 'btn-primary'));
        document.querySelectorAll('.cat-tab').forEach(b => b.classList.add('btn-glass'));
        
        btn.classList.remove('btn-glass');
        btn.classList.add('active', 'btn-primary');
        
        this.activeCategory = btn.getAttribute('data-cat');
        this.filterProducts(this.activeCategory);
      });
    });

    // POS Barcode keyboard inputs
    const barcodeField = document.getElementById('posBarcodeField');
    barcodeField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = barcodeField.value.trim();
        if (value) {
          this.handleBarcodeScan(value);
          barcodeField.value = '';
        }
      }
    });

    // F2 Hotkey focus, F9 Checkout Hotkey
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        const f = document.getElementById('posBarcodeField');
        if (f) f.focus();
      }
      if (e.key === 'F9') {
        e.preventDefault();
        const btn = document.getElementById('posCheckoutBtn');
        if (btn && !btn.disabled) btn.click();
      }
    });

    // Socket Barcode Scanning handler
    window.socket.on('barcode:result', (data) => {
      if (data.found && data.product) {
        this.addToCart(data.product);
      } else {
        window.app.showToast(`Product not found for: ${data.barcode}`, 'warning');
      }
    });

    // Checkout collection collectors
    const checkoutBtn = document.getElementById('posCheckoutBtn');
    const modalEl = document.getElementById('posCheckoutModal');
    const modal = new bootstrap.Modal(modalEl);

    checkoutBtn.addEventListener('click', () => {
      const summaryTotal = this.calculateCartTotal();
      document.getElementById('checkoutAmount').innerText = '₹' + summaryTotal.total.toFixed(2);
      document.getElementById('cashTendered').value = summaryTotal.total.toFixed(2);
      document.getElementById('cashReturn').value = '₹0.00';
      modal.show();
    });

    // Payment tendered calculation
    const cashTendered = document.getElementById('cashTendered');
    cashTendered.addEventListener('input', () => {
      const total = this.calculateCartTotal().total;
      const tendered = parseFloat(cashTendered.value) || 0;
      const returnAmt = tendered - total;
      document.getElementById('cashReturn').value = `₹${Math.max(0, returnAmt).toFixed(2)}`;
    });

    // Payment Form Submission
    document.getElementById('posPaymentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const spinner = document.getElementById('checkoutSpinner');
      spinner.classList.remove('d-none');
      
      const payload = {
        customer: document.getElementById('posCustomerSelect').value === 'walkin' ? null : document.getElementById('posCustomerSelect').value,
        items: this.cart.map(item => ({
          product: item.product._id,
          name: item.product.name,
          quantity: item.quantity,
          mrp: item.product.mrp,
          sellingPrice: item.product.sellingPrice,
          taxRate: item.product.taxes || item.product.gstRate || 18,
          discountAmount: item.discount
        })),
        paymentMode: document.getElementById('payMode').value,
        amountPaid: parseFloat(document.getElementById('cashTendered').value) || 0
      };

      try {
        const res = await window.api.post('/pos/bill', payload);
        if (res.success) {
          window.app.showToast('Bill generated and printed successfully');
          modal.hide();
          this.cart = [];
          this.renderCart();
          this.printReceipt(res.data.invoice);
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      } finally {
        spinner.classList.add('d-none');
      }
    });
  }

  handleBarcodeScan(barcode) {
    // Query local memory first
    const prod = this.products.find(p => p.barcode === barcode || p.sku === barcode);
    if (prod) {
      this.addToCart(prod);
    } else {
      // Fetch from API via Socket scan
      window.socket.scanBarcode(barcode);
    }
  }

  filterProducts(categoryId) {
    const container = document.getElementById('posProductsContainer');
    container.innerHTML = '';

    const filtered = categoryId 
      ? this.products.filter(p => p.category?._id === categoryId || p.category === categoryId)
      : this.products;

    if (filtered.length === 0) {
      container.innerHTML = '<div class="text-center w-100 py-5 text-muted">No products in this category</div>';
      return;
    }

    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'col';
      const img = p.primaryImage || 'https://cdn-icons-png.flaticon.com/512/5164/5164023.png';
      card.innerHTML = `
        <div class="pos-product-card rounded bg-light-glow p-2 text-center border border-secondary shadow-sm" style="cursor:pointer; transition:transform 0.2s;">
          <img src="${img}" class="rounded mb-2" style="width:100%; height:80px; object-fit:contain;">
          <div class="fw-semibold text-xs text-truncate">${p.name}</div>
          <div class="text-xs text-muted">Stock: ${p.currentStock || 0}</div>
          <div class="fw-bold mt-1 text-primary">₹${p.sellingPrice.toFixed(2)}</div>
        </div>
      `;
      
      card.addEventListener('click', () => {
        this.addToCart(p);
      });
      container.appendChild(card);
    });
  }

  addToCart(product) {
    const existing = this.cart.find(item => item.product._id === product._id);
    
    // Check stock validation limits
    const currentQty = existing ? existing.quantity : 0;
    if (product.currentStock <= currentQty) {
      window.app.showToast(`Insufficient stock levels for: ${product.name}`, 'warning');
      return;
    }

    if (existing) {
      existing.quantity++;
    } else {
      this.cart.push({
        product,
        quantity: 1,
        discount: 0
      });
    }

    window.app.showToast(`Added to cart: ${product.name}`, 'success');
    this.renderCart();
  }

  renderCart() {
    const cartEl = document.getElementById('posCartItems');
    cartEl.innerHTML = '';

    if (this.cart.length === 0) {
      cartEl.innerHTML = `
        <div class="text-center py-5 text-muted" id="cartEmptyMsg">
          <i class="bi bi-cart3 display-6 d-block mb-2"></i>
          Cart is empty
        </div>
      `;
      document.getElementById('posCheckoutBtn').disabled = true;
      this.updateSummary(0, 0, 0, 0);
      return;
    }

    document.getElementById('posCheckoutBtn').disabled = false;

    this.cart.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'd-flex justify-content-between align-items-center mb-2 p-2 rounded bg-light-glow border-bottom border-secondary text-xs';
      row.innerHTML = `
        <div class="flex-grow-1 min-w-0 me-2">
          <div class="fw-semibold text-truncate">${item.product.name}</div>
          <div class="text-muted">₹${item.product.sellingPrice.toFixed(2)} + ${item.product.taxes || item.product.gstRate || 18}% GST</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-xs btn-outline-secondary btn-minus" data-idx="${index}">-</button>
          <span class="fw-bold">${item.quantity}</span>
          <button class="btn btn-xs btn-outline-secondary btn-plus" data-idx="${index}">+</button>
          <span class="fw-semibold ms-2" style="min-width: 60px; text-align:right;">₹${(item.product.sellingPrice * item.quantity).toFixed(2)}</span>
          <button class="btn btn-xs btn-outline-danger btn-remove" data-idx="${index}"><i class="bi bi-x"></i></button>
        </div>
      `;

      // Wire cart list row action listeners
      row.querySelector('.btn-plus').addEventListener('click', () => {
        this.addToCart(item.product);
      });

      row.querySelector('.btn-minus').addEventListener('click', () => {
        if (item.quantity > 1) {
          item.quantity--;
        } else {
          this.cart.splice(index, 1);
        }
        this.renderCart();
      });

      row.querySelector('.btn-remove').addEventListener('click', () => {
        this.cart.splice(index, 1);
        this.renderCart();
      });

      cartEl.appendChild(row);
    });

    const summary = this.calculateCartTotal();
    this.updateSummary(summary.subtotal, summary.discount, summary.tax, summary.total);
  }

  calculateCartTotal() {
    let subtotal = 0;
    let tax = 0;
    let discount = 0;

    this.cart.forEach(item => {
      const itemSub = item.product.sellingPrice * item.quantity;
      const taxRate = item.product.taxes || item.product.gstRate || 18;
      const itemTax = itemSub * (taxRate / 100);
      
      subtotal += itemSub;
      tax += itemTax;
      discount += item.discount * item.quantity;
    });

    return {
      subtotal,
      tax,
      discount,
      total: subtotal + tax - discount
    };
  }

  updateSummary(sub, disc, tax, tot) {
    document.getElementById('posSubtotal').innerText = '₹' + sub.toFixed(2);
    document.getElementById('posDiscount').innerText = '-₹' + disc.toFixed(2);
    document.getElementById('posTax').innerText = '₹' + tax.toFixed(2);
    document.getElementById('posTotal').innerText = '₹' + tot.toFixed(2);
  }

  printReceipt(invoice) {
    const win = window.open('', '_blank');
    const itemsHtml = invoice.items.map(item => `
      <tr>
        <td style="padding:4px 0;">${item.name}</td>
        <td style="text-align:center;">${item.quantity}</td>
        <td style="text-align:right;">₹${(item.sellingPrice * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    win.document.write(`
      <html>
        <head>
          <title>POS Receipt - ${invoice.invoiceNumber}</title>
          <style>
            body { font-family: monospace; font-size: 11px; width: 280px; margin: 0 auto; padding: 10px; color:#000; }
            .header { text-align: center; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            .totals { font-weight: bold; border-top: 1px dashed #000; padding-top: 5px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h3>INVENTRA RETAIL</h3>
            <div>Invoice: ${invoice.invoiceNumber}</div>
            <div>Date: ${new Date(invoice.invoiceDate).toLocaleString()}</div>
          </div>
          <hr style="border-top:1px dashed #000;">
          <table>
            <thead>
              <tr style="border-bottom:1px dashed #000;">
                <th style="text-align:left;">Item</th>
                <th>Qty</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <hr style="border-top:1px dashed #000;">
          <div class="totals">
            <div style="display:flex; justify-content:space-between;"><span>SUBTOTAL</span><span>₹${invoice.taxableAmount.toFixed(2)}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>CGST</span><span>₹${invoice.cgstAmount.toFixed(2)}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>SGST</span><span>₹${invoice.sgstAmount.toFixed(2)}</span></div>
            <div style="display:flex; justify-content:space-between; font-size:14px; margin-top:5px;"><span>NET TOTAL</span><span>₹${invoice.totalAmount.toFixed(2)}</span></div>
          </div>
          <div style="text-align:center; margin-top:20px;">Thank you! Visit again.</div>
        </body>
      </html>
    `);
    win.document.close();
  }

  // ─── POS Billing History List ───────────────────────────────────────────────
  async renderBillsHistory(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">POS Billing History</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="posBillsTable">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date & Time</th>
                <th>Payment Mode</th>
                <th>Taxable Amt</th>
                <th>Total Pay</th>
                <th>Created By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#posBillsTable').DataTable({
      ajax: {
        url: '/api/v1/invoices?invoiceType=pos',
        dataSrc: 'data.invoices',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'invoiceNumber' },
        { data: 'invoiceDate', render: (d) => new Date(d).toLocaleString() },
        { data: 'paymentMode', render: (m) => `<span class="badge bg-secondary">${(m || 'cash').toUpperCase()}</span>` },
        { data: 'taxableAmount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'totalAmount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'createdBy.name', defaultContent: 'Cashier' },
        {
          data: null,
          render: (row) => `<button class="btn btn-xs btn-outline-light print-btn" data-id="${row._id}"><i class="bi bi-printer"></i></button>`
        }
      ],
      drawCallback: () => {
        $('.print-btn').on('click', async (e) => {
          const id = $(e.currentTarget).data('id');
          try {
            const res = await window.api.get(`/invoices/${id}`);
            if (res.success && res.data.invoice) {
              this.printReceipt(res.data.invoice);
            }
          } catch (err) {
            window.app.showToast(err.message, 'danger');
          }
        });
      }
    });
  }
}

// Register globally
window.posModule = new POSModule();
