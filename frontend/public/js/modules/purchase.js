/**
 * Purchase Module for Inventra Enterprise ERP
 */
class PurchaseModule {
  constructor() {
    this.table = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'grn') {
      return this.renderGRN(container);
    } else if (subModule === 'suppliers') {
      return this.renderSuppliers(container);
    } else if (subModule === 'payments') {
      return this.renderDisbursements(container);
    } else {
      // Default: Purchase Orders
      return this.renderPurchaseOrders(container, query);
    }
  }

  // ─── Purchase Orders Master List ─────────────────────────────────────────────
  async renderPurchaseOrders(container, query) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">Purchase Orders</h3>
            <p class="text-muted text-sm mb-0">Disburse purchasing terms to vendors, receive shipments via GRNs, and map inventory additions.</p>
          </div>
          <button class="btn btn-primary" id="addNewPOBtn"><i class="bi bi-plus-lg me-1"></i>New Purchase Order</button>
        </div>

        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="poTable">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Order Date</th>
                <th>Total Value</th>
                <th>Status</th>
                <th>GRN Sync</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#poTable').DataTable({
      ajax: {
        url: '/api/v1/purchases',
        dataSrc: 'data.purchaseOrders',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'poNumber', render: (n) => `<strong>${n}</strong>` },
        { data: 'supplier.name', defaultContent: 'General Vendor' },
        { data: 'orderDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'totalAmount', render: (a) => `₹${a.toFixed(2)}` },
        {
          data: 'status',
          render: (s) => `<span class="badge bg-${s === 'completed' ? 'success' : s === 'draft' ? 'secondary' : 'info'}">${s.toUpperCase()}</span>`
        },
        {
          data: null,
          render: (row) => row.status === 'ordered' 
            ? `<button class="btn btn-xs btn-outline-success build-grn-btn" data-id="${row._id}">Receive Goods</button>` 
            : `Synced`
        }
      ],
      drawCallback: () => {
        $('.build-grn-btn').on('click', async (e) => {
          const id = $(e.currentTarget).data('id');
          this.triggerGRNReceipt(id);
        });
      }
    });

    document.getElementById('addNewPOBtn').addEventListener('click', () => {
      this.renderPOBuilder(container);
    });
  }

  async triggerGRNReceipt(poId) {
    window.app.showConfirm('Receive Goods (GRN)', 'Create Good Receipt Note for this PO? This will add quantities directly into default warehouses.', async () => {
      try {
        const res = await window.api.post(`/purchases/${poId}/grn`, {
          receivedDate: new Date(),
          remarks: 'Received in full via front-end wizard'
        });
        if (res.success) {
          window.app.showToast('GRN completed. Stock levels updated.');
          window.app.navigate('purchase/grn');
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    });
  }

  // ─── PO Builder Form ────────────────────────────────────────────────────────
  async renderPOBuilder(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">Draft Purchase Order</h3>
            <p class="text-muted text-sm mb-0">Record vendor procurement requirements.</p>
          </div>
          <div>
            <button class="btn btn-outline-info me-2" id="ocrScanBtn"><i class="bi bi-magic me-1"></i>Smart Scan (OCR)</button>
            <input type="file" id="ocrFileInput" accept="image/*" class="d-none">
            <button class="btn btn-outline-secondary" id="backToPOsBtn"><i class="bi bi-arrow-left me-1"></i>Back to POs</button>
          </div>
        </div>

        <form id="poForm">
          <div class="row g-4">
            <div class="col-md-8">
              <div class="glass-card card-glow p-4 mb-4">
                <h5 class="fw-bold mb-3">Vendor & Shipping</h5>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label">Select Supplier</label>
                    <select id="poSupplier" class="form-select" required></select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Delivery Date</label>
                    <input type="date" id="poDeliveryDate" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                  </div>
                </div>
              </div>

              <!-- Item grid -->
              <div class="glass-card card-glow p-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h5 class="fw-bold mb-0">Items to Purchase</h5>
                  <button type="button" class="btn btn-sm btn-outline-primary" id="addPoRowBtn">Add Row</button>
                </div>
                <table class="table text-sm">
                  <thead>
                    <tr>
                      <th style="width:50%;">Product</th>
                      <th>Quantity</th>
                      <th>Purchase Price (₹)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="poItemsBody"></tbody>
                </table>
              </div>
            </div>

            <div class="col-md-4">
              <div class="glass-card card-glow p-4">
                <h5 class="fw-bold mb-3">Total Value</h5>
                <div class="mb-3">
                  <label class="form-label">Grand Total</label>
                  <input type="text" id="poTotalValue" class="form-control fw-bold text-success fs-5" readonly value="₹0.00">
                </div>
                <button type="submit" class="btn btn-primary w-100 py-2">Create PO</button>
              </div>
            </div>
          </div>
        </form>
      </div>
    `;

    // Dropdowns
    const sups = await window.api.get('/suppliers');
    const prods = await window.api.get('/products');

    const supSelect = document.getElementById('poSupplier');
    sups.data.suppliers.forEach(s => {
      supSelect.innerHTML += `<option value="${s._id}">${s.name}</option>`;
    });

    const itemsBody = document.getElementById('poItemsBody');

    const addRow = () => {
      const tr = document.createElement('tr');
      let opt = '<option value="">Select product...</option>';
      prods.data.products.forEach(p => {
        opt += `<option value="${p._id}" data-cost="${p.purchasePrice}">${p.name}</option>`;
      });

      tr.innerHTML = `
        <td><select class="form-select form-select-sm prod-select" required>${opt}</select></td>
        <td><input type="number" class="form-control form-control-sm qty-input" min="1" value="1" required></td>
        <td><input type="number" class="form-control form-control-sm price-input" step="0.01" value="0" required></td>
        <td><button type="button" class="btn btn-xs btn-outline-danger remove-row"><i class="bi bi-trash"></i></button></td>
      `;

      const sel = tr.querySelector('.prod-select');
      const prc = tr.querySelector('.price-input');
      const qty = tr.querySelector('.qty-input');

      const recalcTotal = () => {
        let grand = 0;
        document.querySelectorAll('#poItemsBody tr').forEach(row => {
          const q = parseFloat(row.querySelector('.qty-input').value) || 0;
          const p = parseFloat(row.querySelector('.price-input').value) || 0;
          grand += q * p;
        });
        document.getElementById('poTotalValue').value = '₹' + grand.toFixed(2);
      };

      sel.addEventListener('change', () => {
        const option = sel.selectedOptions[0];
        if (option && option.value) {
          prc.value = option.getAttribute('data-cost');
        }
        recalcTotal();
      });

      qty.addEventListener('input', recalcTotal);
      prc.addEventListener('input', recalcTotal);
      
      tr.querySelector('.remove-row').addEventListener('click', () => {
        tr.remove();
        recalcTotal();
      });

      itemsBody.appendChild(tr);
    };

    document.getElementById('addPoRowBtn').addEventListener('click', () => addRow());
    addRow(); // default one row

    document.getElementById('poForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const rows = itemsBody.querySelectorAll('tr');
      
      const items = Array.from(rows).map(row => {
        const product = row.querySelector('.prod-select').value;
        const quantity = parseFloat(row.querySelector('.qty-input').value);
        const purchasePrice = parseFloat(row.querySelector('.price-input').value);
        const opt = row.querySelector('.prod-select').selectedOptions[0];
        const name = opt ? opt.text : 'Product';

        return {
          product,
          name,
          quantity,
          purchasePrice,
          taxRate: 18 // default
        };
      });

      const payload = {
        supplier: document.getElementById('poSupplier').value,
        orderDate: new Date(),
        deliveryDate: document.getElementById('poDeliveryDate').value,
        items
      };

      try {
        const res = await window.api.post('/purchases', payload);
        if (res.success) {
          window.app.showToast('Purchase Order generated successfully');
          window.app.navigate('purchase/orders');
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    });

    // OCR Integration
    const ocrBtn = document.getElementById('ocrScanBtn');
    const ocrInput = document.getElementById('ocrFileInput');
    if (ocrBtn) {
      ocrBtn.addEventListener('click', () => ocrInput.click());
    }
    if (ocrInput) {
      ocrInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        window.app.showToast('Scanning invoice with AI Copilot...', 'info');
        ocrBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Scanning...';
        ocrBtn.disabled = true;

        const formData = new FormData();
        formData.append('invoiceImage', file);

        try {
          const res = await fetch('/api/v1/purchases/ocr-scan', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + window.auth.token
            },
            body: formData
          });
          const json = await res.json();
          if (json.success) {
            const data = json.data.ocrResult;
            window.app.showToast('OCR Scan complete. Auto-filling details.', 'success');
            
            const opts = Array.from(document.getElementById('poSupplier').options);
            const matchedOpt = opts.find(o => o.text.toLowerCase().includes(data.supplierName.toLowerCase()) || data.supplierName.toLowerCase().includes(o.text.toLowerCase()));
            if (matchedOpt) {
              document.getElementById('poSupplier').value = matchedOpt.value;
            } else {
              window.app.showToast(`Extracted Vendor: ${data.supplierName}. Please select manually.`, 'warning');
            }

            if (data.invoiceDate) {
               document.getElementById('poDeliveryDate').value = data.invoiceDate;
            }

            if (data.items && data.items.length > 0) {
               itemsBody.innerHTML = '';
               data.items.forEach(item => {
                  addRow();
                  const lastRow = itemsBody.lastElementChild;
                  lastRow.querySelector('.qty-input').value = item.quantity;
                  lastRow.querySelector('.price-input').value = item.purchasePrice;
                  lastRow.querySelector('.qty-input').dispatchEvent(new Event('input'));
               });
            }
          } else {
            throw new Error(json.message || 'OCR failed');
          }
        } catch(err) {
          window.app.showToast(err.message, 'danger');
        } finally {
          ocrBtn.innerHTML = '<i class="bi bi-magic me-1"></i>Smart Scan (OCR)';
          ocrBtn.disabled = false;
          ocrInput.value = '';
        }
      });
    }

    document.getElementById('backToPOsBtn').addEventListener('click', () => {
      window.app.navigate('purchase/orders');
    });
  }

  // ─── Good Receipt Notes (GRN) ───────────────────────────────────────────────
  async renderGRN(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Goods Receipt Notes (GRNs)</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="grnTable">
            <thead>
              <tr>
                <th>GRN Number</th>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Receipt Date</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    // GRN endpoint logic
    $('#grnTable').DataTable({
      ajax: {
        url: '/api/v1/purchases/grn',
        dataSrc: 'data.grns',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'grnNumber' },
        { data: 'purchaseOrder.poNumber', defaultContent: '--' },
        { data: 'supplier.name', defaultContent: 'Vendor' },
        { data: 'receivedDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'status', render: (s) => `<span class="badge bg-success">${s.toUpperCase()}</span>` },
        { data: 'remarks', defaultContent: '--' }
      ]
    });
  }

  // ─── Suppliers List ──────────────────────────────────────────────────────────
  async renderSuppliers(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3 class="fw-bold header-gradient">Suppliers Ledger Master</h3>
          <button class="btn btn-primary" id="addSupBtn">Add Vendor</button>
        </div>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="supsTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Outstanding Payables</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#supsTable').DataTable({
      ajax: {
        url: '/api/v1/suppliers',
        dataSrc: 'data.suppliers',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'name' },
        { data: 'phone', defaultContent: '--' },
        { data: 'email', defaultContent: '--' },
        {
          data: 'balance',
          render: (b) => `<span class="fw-bold text-${(b || 0) <= 0 ? 'success' : 'danger'}">₹${Math.abs(b || 0).toFixed(2)} ${(b || 0) <= 0 ? 'Cr' : 'Dr'}</span>`
        }
      ]
    });

    document.getElementById('addSupBtn').addEventListener('click', () => {
      const name = prompt("Enter supplier name:");
      const phone = prompt("Enter supplier phone:");
      if (name && phone) {
        window.api.post('/suppliers', { name, phone })
          .then(res => {
            if (res.success) {
              window.app.showToast('Supplier registered');
              $('#supsTable').DataTable().ajax.reload();
            }
          })
          .catch(e => window.app.showToast(e.message, 'danger'));
      }
    });
  }

  // ─── Outward Disbursements ───────────────────────────────────────────────────
  async renderDisbursements(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Supplier Disbursements</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="paymentsTable">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Amount Disbursed</th>
                <th>Payment Mode</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#paymentsTable').DataTable({
      ajax: {
        url: '/api/v1/payments?type=payment',
        dataSrc: 'data.payments',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'paymentNumber' },
        { data: 'paymentDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'supplier.name', defaultContent: 'Supplier' },
        { data: 'amount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'paymentMode', render: (m) => m.toUpperCase() }
      ]
    });
  }
}

// Register globally
window.purchaseModule = new PurchaseModule();
