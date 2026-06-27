/**
 * Sales Module for Inventra Enterprise ERP
 */
class SalesModule {
  constructor() {
    this.table = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'orders') {
      return this.renderSalesOrders(container);
    } else if (subModule === 'quotations') {
      return this.renderQuotations(container);
    } else if (subModule === 'customers') {
      return this.renderCustomers(container);
    } else if (subModule === 'payments') {
      return this.renderReceipts(container);
    } else {
      // Default: Invoices
      return this.renderInvoices(container, query);
    }
  }

  // ─── Sales Invoices List & Builder ───────────────────────────────────────────
  async renderInvoices(container, query) {
    const editId = query.action && query.action.startsWith('view:') ? query.action.split(':')[1] : null;
    const isNew = query.action === 'new';

    if (isNew || editId) {
      return this.renderInvoiceForm(container, editId);
    }

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Sales Invoices</h1>
          <p class="page-subtitle">Issue tax invoices, track payment status, download GST sheets, send reminders.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-outline" id="exportInvoicesBtn">
            <i class="bi bi-download"></i> Export
          </button>
          <button class="btn btn-primary" id="addNewInvoiceBtn">
            <i class="bi bi-plus-lg"></i> New Invoice
          </button>
        </div>
      </div>

      <div class="data-table-wrapper">
        <div class="data-table-header">
          <div class="data-table-title">All Invoices</div>
          <div class="data-table-actions">
            <div class="input-group has-left-icon" style="width:220px;">
              <i class="bi bi-search input-icon-left"></i>
              <input type="search" class="form-control form-control-sm" id="invoiceSearch" placeholder="Search invoices...">
            </div>
            <select class="form-control form-control-sm" id="invoiceStatusFilter" style="width:140px;">
              <option value="">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
        <div class="data-table-scroll">
          <table class="data-table" id="invoicesTable">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>E-Way Bill</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    this.initInvoicesTable();

    document.getElementById('addNewInvoiceBtn').addEventListener('click', () => {
      window.app.navigate('sales/invoices', 'new');
    });
  }

  initInvoicesTable() {
    if ($.fn.DataTable.isDataTable('#invoicesTable')) {
      $('#invoicesTable').DataTable().destroy();
    }

    this.table = $('#invoicesTable').DataTable({
      ajax: {
        url: '/api/v1/invoices?invoiceType=sale',
        dataSrc: 'data.invoices',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'invoiceNumber', render: (n) => `<strong>${n}</strong>` },
        { data: 'customer.name', defaultContent: 'General Cash' },
        { data: 'invoiceDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'dueDate', render: (d) => d ? new Date(d).toLocaleDateString() : '--' },
        { data: 'totalAmount', render: (a) => `₹${a.toFixed(2)}` },
        {
          data: 'paymentStatus',
          render: (s) => `<span class="badge bg-${s === 'paid' ? 'success' : s === 'partially_paid' ? 'info' : 'danger'}">${s.replace('_', ' ').toUpperCase()}</span>`
        },
        {
          data: 'ewayBillNumber',
          render: (e) => e ? `<code class="text-success">${e}</code>` : `<button class="btn btn-xs btn-outline-warning generate-eway-btn">Generate</button>`
        },
        {
          data: '_id',
          render: (data) => `
            <div class="btn-group">
              <button class="btn btn-xs btn-outline-primary view-inv-btn" data-id="${data}"><i class="bi bi-eye"></i></button>
              <button class="btn btn-xs btn-outline-success pdf-inv-btn" data-id="${data}"><i class="bi bi-file-earmark-pdf"></i></button>
              <button class="btn btn-xs btn-outline-danger cancel-inv-btn" data-id="${data}"><i class="bi bi-x-circle"></i></button>
            </div>
          `
        }
      ],
      drawCallback: () => {
        $('.view-inv-btn').on('click', (e) => {
          const id = $(e.currentTarget).data('id');
          window.app.navigate('sales/invoices', `view:${id}`);
        });

        $('.pdf-inv-btn').on('click', (e) => {
          const id = $(e.currentTarget).data('id');
          // Open PDF download endpoint in new window
          window.open(`/api/v1/invoices/${id}/pdf`, '_blank');
        });

        $('.cancel-inv-btn').on('click', (e) => {
          const id = $(e.currentTarget).data('id');
          window.app.showConfirm('Cancel Invoice', 'Are you sure you want to mark this invoice as cancelled? This will reverse all ledger balances.', async () => {
            try {
              const res = await window.api.patch(`/invoices/${id}/cancel`, {});
              if (res.success) {
                window.app.showToast('Invoice cancelled successfully');
                this.initInvoicesTable();
              }
            } catch (err) {
              window.app.showToast(err.message, 'danger');
            }
          });
        });
      }
    });
  }

  // ─── Sales Invoice Builder Form ──────────────────────────────────────────────
  async renderInvoiceForm(container, editId) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">${editId ? 'View Invoice details' : 'Draft Sales Invoice'}</h3>
            <p class="text-muted text-sm mb-0">Record a B2B tax or retail invoice. Live balances will post directly to customers' ledger.</p>
          </div>
          <button class="btn btn-outline-secondary" id="backToInvsBtn">
            <i class="bi bi-arrow-left me-1"></i>Back to Invoices
          </button>
        </div>

        <form id="invoiceForm">
          <div class="row g-4">
            
            <!-- Left Info Panel -->
            <div class="col-12 col-lg-8">
              <div class="glass-card card-glow p-4 mb-4">
                <h5 class="fw-bold mb-3 border-bottom pb-2">Client Details</h5>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label">Client Name</label>
                    <select id="invCustomer" class="form-select" required></select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Billing Date</label>
                    <input type="date" id="invDate" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Due Date</label>
                    <input type="date" id="invDueDate" class="form-control" required value="${new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]}">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Shipping Place</label>
                    <input type="text" id="invShipping" class="form-control" placeholder="Acme Warehouse 2">
                  </div>
                </div>
              </div>

              <!-- Product Line Items grid -->
              <div class="glass-card card-glow p-4">
                <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                  <h5 class="fw-bold mb-0">Item Mapping Grid</h5>
                  <button type="button" class="btn btn-sm btn-outline-primary" id="addInvLineBtn"><i class="bi bi-plus-circle me-1"></i>Add Row</button>
                </div>
                <div class="table-responsive">
                  <table class="table align-middle text-sm" id="invItemsTable">
                    <thead>
                      <tr>
                        <th style="width:40%;">Product Twin</th>
                        <th>Quantity</th>
                        <th>Price (₹)</th>
                        <th>Tax (%)</th>
                        <th style="width:15%;">Total Value</th>
                        <th style="width:5%;"></th>
                      </tr>
                    </thead>
                    <tbody id="invItemsBody">
                      <!-- Appended dynamically -->
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Right Calculation Summary Panel -->
            <div class="col-12 col-lg-4">
              <div class="glass-card card-glow p-4 mb-4">
                <h5 class="fw-bold mb-3 border-bottom pb-2">Financial Accounting post</h5>
                <div class="mb-3">
                  <label class="form-label">Total Taxable Amount</label>
                  <input type="text" id="invTotalTaxable" class="form-control" readonly value="₹0.00">
                </div>
                <div class="mb-3">
                  <label class="form-label">Total GST Tax</label>
                  <input type="text" id="invTotalTax" class="form-control" readonly value="₹0.00">
                </div>
                <div class="mb-3">
                  <label class="form-label">Net Payable Amount</label>
                  <input type="text" id="invNetTotal" class="form-control fw-bold fs-5 text-primary bg-light" readonly value="₹0.00">
                </div>
              </div>

              <div class="glass-card card-glow p-4 mb-4">
                <h5 class="fw-bold mb-3 border-bottom pb-2">Extra Configuration</h5>
                <div class="mb-3">
                  <label class="form-label">Freight charges</label>
                  <input type="number" id="invFreight" class="form-control" value="0">
                </div>
                <div class="mb-3">
                  <label class="form-label">Internal notes / Remarks</label>
                  <textarea id="invRemarks" class="form-control" rows="2" placeholder="Shipped via Fedex..."></textarea>
                </div>
              </div>

              <div class="d-grid gap-2">
                <button type="submit" class="btn btn-primary btn-lg" id="saveInvBtn">
                  <span class="spinner-border spinner-border-sm me-2 d-none" id="saveInvSpinner"></span>
                  Save Invoice
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    `;

    // Dropdown populations
    const custs = await window.api.get('/customers?limit=100');
    const prods = await window.api.get('/products');
    
    const custSelect = document.getElementById('invCustomer');
    custs.data.customers.forEach(c => {
      custSelect.innerHTML += `<option value="${c._id}">${c.name} (GSTIN: ${c.gstin || '--'})</option>`;
    });

    const productsList = prods.data.products;

    const itemsBody = document.getElementById('invItemsBody');

    const addRow = (pId = '', qty = 1, price = 0, tax = 18) => {
      const tr = document.createElement('tr');
      
      let options = '<option value="">Select product...</option>';
      productsList.forEach(p => {
        options += `<option value="${p._id}" data-price="${p.sellingPrice}" data-tax="${p.taxes || p.gstRate || 18}" ${p._id === pId ? 'selected' : ''}>${p.name} (SKU: ${p.sku})</option>`;
      });

      tr.innerHTML = `
        <td><select class="form-select form-select-sm prod-select" required>${options}</select></td>
        <td><input type="number" class="form-control form-control-sm qty-input" min="1" value="${qty}" required></td>
        <td><input type="number" class="form-control form-control-sm price-input" step="0.01" value="${price}" required></td>
        <td>
          <select class="form-select form-select-sm tax-select">
            <option value="0" ${tax === 0 ? 'selected' : ''}>0%</option>
            <option value="5" ${tax === 5 ? 'selected' : ''}>5%</option>
            <option value="12" ${tax === 12 ? 'selected' : ''}>12%</option>
            <option value="18" ${tax === 18 ? 'selected' : ''}>18%</option>
            <option value="28" ${tax === 28 ? 'selected' : ''}>28%</option>
          </select>
        </td>
        <td class="row-total fw-semibold text-end">₹0.00</td>
        <td><button type="button" class="btn btn-xs btn-outline-danger remove-row-btn"><i class="bi bi-trash"></i></button></td>
      `;

      // Event listener adjustments
      const select = tr.querySelector('.prod-select');
      const qtyIn = tr.querySelector('.qty-input');
      const priceIn = tr.querySelector('.price-input');
      const taxSel = tr.querySelector('.tax-select');

      const recalcRow = () => {
        const q = parseFloat(qtyIn.value) || 0;
        const p = parseFloat(priceIn.value) || 0;
        const t = parseFloat(taxSel.value) || 0;
        const taxable = q * p;
        const taxVal = taxable * (t / 100);
        
        tr.querySelector('.row-total').innerText = '₹' + (taxable + taxVal).toFixed(2);
        this.recalculateInvoiceSummary();
      };

      select.addEventListener('change', () => {
        const opt = select.selectedOptions[0];
        if (opt && opt.value) {
          priceIn.value = opt.getAttribute('data-price');
          taxSel.value = opt.getAttribute('data-tax');
        }
        recalcRow();
      });

      qtyIn.addEventListener('input', recalcRow);
      priceIn.addEventListener('input', recalcRow);
      taxSel.addEventListener('change', recalcRow);

      tr.querySelector('.remove-row-btn').addEventListener('click', () => {
        tr.remove();
        this.recalculateInvoiceSummary();
      });

      itemsBody.appendChild(tr);
      recalcRow();
    };

    document.getElementById('addInvLineBtn').addEventListener('click', () => addRow());

    // If editId (view mode), load and disable elements
    if (editId) {
      const invRes = await window.api.get(`/invoices/${editId}`);
      if (invRes.success && invRes.data.invoice) {
        const inv = invRes.data.invoice;
        document.getElementById('invCustomer').value = inv.customer?._id || inv.customer || '';
        document.getElementById('invDate').value = new Date(inv.invoiceDate).toISOString().split('T')[0];
        document.getElementById('invDueDate').value = new Date(inv.dueDate).toISOString().split('T')[0];
        document.getElementById('invShipping').value = inv.shippingAddress || '';
        document.getElementById('invFreight').value = inv.shippingCharges || 0;
        document.getElementById('invRemarks').value = inv.notes || '';

        // Load rows
        inv.items.forEach(item => {
          addRow(item.product?._id || item.product, item.quantity, item.sellingPrice, item.taxRate);
        });

        // Disable form editing in view mode
        document.querySelectorAll('#invoiceForm input, #invoiceForm select, #invoiceForm textarea, #invoiceForm button').forEach(el => el.disabled = true);
        document.getElementById('saveInvBtn').style.display = 'none';
      }
    } else {
      // Add one empty row on draft creation
      addRow();
    }

    // Save submit logic
    document.getElementById('invoiceForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const rows = itemsBody.querySelectorAll('tr');
      if (rows.length === 0) {
        window.app.showToast('Please add at least one line item', 'warning');
        return;
      }

      const spinner = document.getElementById('saveInvSpinner');
      spinner.classList.remove('d-none');
      document.getElementById('saveInvBtn').disabled = true;

      const items = Array.from(rows).map(tr => {
        const product = tr.querySelector('.prod-select').value;
        const quantity = parseFloat(tr.querySelector('.qty-input').value);
        const sellingPrice = parseFloat(tr.querySelector('.price-input').value);
        const taxRate = parseFloat(tr.querySelector('.tax-select').value);
        const opt = tr.querySelector('.prod-select').selectedOptions[0];
        const name = opt ? opt.text.split(' (')[0] : 'Product';

        return {
          product,
          name,
          quantity,
          sellingPrice,
          taxRate,
          mrp: sellingPrice * 1.15 // proxy Mrp
        };
      });

      const payload = {
        invoiceType: 'sale',
        customer: document.getElementById('invCustomer').value,
        invoiceDate: document.getElementById('invDate').value,
        dueDate: document.getElementById('invDueDate').value,
        shippingAddress: document.getElementById('invShipping').value,
        shippingCharges: parseFloat(document.getElementById('invFreight').value) || 0,
        notes: document.getElementById('invRemarks').value,
        items
      };

      try {
        const res = await window.api.post('/sales/invoices', payload);
        if (res.success) {
          window.app.showToast(`Invoice saved successfully: ${res.data.invoice.invoiceNumber}`);
          window.app.navigate('sales/invoices');
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      } finally {
        spinner.classList.add('d-none');
        document.getElementById('saveInvBtn').disabled = false;
      }
    });

    document.getElementById('backToInvsBtn').addEventListener('click', () => {
      window.app.navigate('sales/invoices');
    });
  }

  recalculateInvoiceSummary() {
    let totalTaxable = 0;
    let totalTax = 0;

    const rows = document.querySelectorAll('#invItemsBody tr');
    rows.forEach(tr => {
      const q = parseFloat(tr.querySelector('.qty-input').value) || 0;
      const p = parseFloat(tr.querySelector('.price-input').value) || 0;
      const t = parseFloat(tr.querySelector('.tax-select').value) || 0;
      
      const taxable = q * p;
      const tax = taxable * (t / 100);

      totalTaxable += taxable;
      totalTax += tax;
    });

    const freight = parseFloat(document.getElementById('invFreight').value) || 0;
    const netTotal = totalTaxable + totalTax + freight;

    document.getElementById('invTotalTaxable').value = '₹' + totalTaxable.toFixed(2);
    document.getElementById('invTotalTax').value = '₹' + totalTax.toFixed(2);
    document.getElementById('invNetTotal').value = '₹' + netTotal.toFixed(2);
  }

  // ─── Sales Orders Management ────────────────────────────────────────────────
  async renderSalesOrders(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Sales Orders</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="salesOrdersTable">
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Customer</th>
                <th>Order Date</th>
                <th>Total Value</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#salesOrdersTable').DataTable({
      ajax: {
        url: '/api/v1/sales/orders',
        dataSrc: 'data.orders',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'orderNumber' },
        { data: 'customer.name', defaultContent: 'Cash Client' },
        { data: 'orderDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'totalAmount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'status', render: (s) => `<span class="badge bg-primary">${s.toUpperCase()}</span>` },
        {
          data: '_id',
          render: (id) => `<button class="btn btn-xs btn-outline-primary convert-inv-btn" data-id="${id}">Bill Order</button>`
        }
      ]
    });
  }

  // ─── Quotations Builder ──────────────────────────────────────────────────────
  async renderQuotations(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Estimates & Quotations</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="quotationsTable">
            <thead>
              <tr>
                <th>Quotation No</th>
                <th>Customer</th>
                <th>Issue Date</th>
                <th>Total Value</th>
                <th>Expiry</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#quotationsTable').DataTable({
      ajax: {
        url: '/api/v1/sales/quotations',
        dataSrc: 'data.quotations',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'quotationNumber' },
        { data: 'customer.name', defaultContent: '--' },
        { data: 'quotationDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'totalAmount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'expiryDate', render: (d) => d ? new Date(d).toLocaleDateString() : '--' },
        { data: 'status', render: (s) => `<span class="badge bg-secondary">${s}</span>` }
      ]
    });
  }

  // ─── CRM Customers List ──────────────────────────────────────────────────────
  async renderCustomers(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">CRM Customers Master</h3>
            <p class="text-muted text-sm mb-0">Record B2B customers, credit limits, addresses and detailed balance sheets.</p>
          </div>
          <button class="btn btn-primary" id="addCustBtn"><i class="bi bi-plus-lg me-1"></i>New Customer</button>
        </div>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="custsTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Phone</th>
                <th>Email</th>
                <th>GSTIN</th>
                <th>Active Balance</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#custsTable').DataTable({
      ajax: {
        url: '/api/v1/customers',
        dataSrc: 'data.customers',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'name' },
        { data: 'companyName', defaultContent: '--' },
        { data: 'phone', defaultContent: '--' },
        { data: 'email', defaultContent: '--' },
        { data: 'gstin', defaultContent: '--' },
        {
          data: 'balance',
          render: (b) => `<span class="fw-bold text-${(b || 0) >= 0 ? 'success' : 'danger'}">₹${Math.abs(b || 0).toFixed(2)} ${(b || 0) >= 0 ? 'Cr' : 'Dr'}</span>`
        }
      ]
    });

    document.getElementById('addCustBtn').addEventListener('click', () => {
      const name = prompt("Enter customer name:");
      const phone = prompt("Enter customer phone number:");
      if (name && phone) {
        window.api.post('/customers', { name, phone })
          .then(res => {
            if (res.success) {
              window.app.showToast('Customer created successfully');
              $('#custsTable').DataTable().ajax.reload();
            }
          })
          .catch(e => window.app.showToast(e.message, 'danger'));
      }
    });
  }

  // ─── Payment Receipts ────────────────────────────────────────────────────────
  async renderReceipts(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Payment Receipts</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="receiptsTable">
            <thead>
              <tr>
                <th>Receipt No</th>
                <th>Payment Date</th>
                <th>Amount Collected</th>
                <th>Mode</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#receiptsTable').DataTable({
      ajax: {
        url: '/api/v1/payments?type=receipt',
        dataSrc: 'data.payments',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'paymentNumber' },
        { data: 'paymentDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'amount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'paymentMode', render: (m) => m.toUpperCase() },
        { data: 'reference', defaultContent: '--' }
      ]
    });
  }
}

// Register globally
window.salesModule = new SalesModule();
