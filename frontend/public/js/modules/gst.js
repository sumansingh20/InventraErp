/**
 * GST & Taxation Module for Inventra Enterprise ERP
 */
class GSTModule {
  constructor() {
    this.gstr1Table = null;
    this.gstr2Table = null;
    this.hsnTable = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'gstr2') {
      return this.renderGSTR2(container);
    } else if (subModule === 'hsn') {
      return this.renderHSNSummary(container);
    } else {
      // Default: GSTR-1
      return this.renderGSTR1(container);
    }
  }

  // ─── GSTR-1 Sales Tax Return Report ──────────────────────────────────────────
  async renderGSTR1(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">GSTR-1 Tax Return Filing</h3>
            <p class="text-muted text-sm mb-0">Review Outward Supplies statement. Reconcile IGST, CGST, and SGST postings.</p>
          </div>
          <div class="d-flex gap-2">
            <select id="gstMonth" class="form-select form-select-sm" style="width:120px;">
              <option value="6" selected>June</option>
              <option value="7">July</option>
              <option value="8">August</option>
            </select>
            <select id="gstYear" class="form-select form-select-sm" style="width:100px;">
              <option value="2026" selected>2026</option>
              <option value="2027">2027</option>
            </select>
            <button class="btn btn-sm btn-glass" id="loadGstr1Btn">Apply</button>
          </div>
        </div>

        <!-- Summary Widgets -->
        <div class="row g-3 mb-4" id="gstSummaryGrid">
          <div class="col-6 col-md-3">
            <div class="glass-card card-glow p-3">
              <span class="text-muted text-xs">Total Taxable Value</span>
              <h5 class="fw-bold mt-1 text-primary" id="g1Taxable">₹0.00</h5>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="glass-card card-glow p-3">
              <span class="text-muted text-xs">CGST Amount</span>
              <h5 class="fw-bold mt-1 text-success" id="g1Cgst">₹0.00</h5>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="glass-card card-glow p-3">
              <span class="text-muted text-xs">SGST Amount</span>
              <h5 class="fw-bold mt-1 text-success" id="g1Sgst">₹0.00</h5>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="glass-card card-glow p-3">
              <span class="text-muted text-xs">IGST Amount</span>
              <h5 class="fw-bold mt-1 text-warning" id="g1Igst">₹0.00</h5>
            </div>
          </div>
        </div>

        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="gstr1Table">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Client Name</th>
                <th>GSTIN</th>
                <th>Taxable Amount (₹)</th>
                <th>Total CGST (₹)</th>
                <th>Total SGST (₹)</th>
                <th>Total IGST (₹)</th>
                <th>Total Tax</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    const loadGstr1 = async () => {
      const month = document.getElementById('gstMonth').value;
      const year = document.getElementById('gstYear').value;

      try {
        const res = await window.api.get(`/gst/gstr1?month=${month}&year=${year}`);
        if (res.success) {
          // Render values
          let taxable = 0;
          let cgst = 0;
          let sgst = 0;
          let igst = 0;

          if (res.data.summary && res.data.summary.length > 0) {
            res.data.summary.forEach(s => {
              taxable += s.taxableAmount;
              cgst += s.cgst;
              sgst += s.sgst;
              igst += s.igst;
            });
          }

          document.getElementById('g1Taxable').innerText = '₹' + taxable.toFixed(2);
          document.getElementById('g1Cgst').innerText = '₹' + cgst.toFixed(2);
          document.getElementById('g1Sgst').innerText = '₹' + sgst.toFixed(2);
          document.getElementById('g1Igst').innerText = '₹' + igst.toFixed(2);

          // Populate Table
          if ($.fn.DataTable.isDataTable('#gstr1Table')) {
            $('#gstr1Table').DataTable().destroy();
          }

          $('#gstr1Table').DataTable({
            data: res.data.invoices,
            columns: [
              { data: 'invoiceNumber' },
              { data: 'customer.name', defaultContent: 'Cash Customer' },
              { data: 'customer.gstin', defaultContent: '--' },
              { data: 'taxableAmount', render: (a) => `₹${a.toFixed(2)}` },
              { data: 'cgstAmount', render: (a) => `₹${a.toFixed(2)}` },
              { data: 'sgstAmount', render: (a) => `₹${a.toFixed(2)}` },
              { data: 'igstAmount', render: (a) => `₹${a.toFixed(2)}` },
              { data: 'totalTax', render: (a) => `₹${a.toFixed(2)}` }
            ]
          });
        }
      } catch (e) {
        window.app.showToast('GSTR-1 report mapping failure', 'danger');
      }
    };

    document.getElementById('loadGstr1Btn').onclick = loadGstr1;
    loadGstr1();
  }

  // ─── GSTR-2 Purchase Reconciliations ─────────────────────────────────────────
  async renderGSTR2(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">GSTR-2 Purchase Reconciliation</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="gstr2Table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Vendor</th>
                <th>GSTIN</th>
                <th>Order Date</th>
                <th>Total Amount</th>
                <th>Estimated ITC</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#gstr2Table').DataTable({
      ajax: {
        url: '/api/v1/gst/gstr2?month=6&year=2026',
        dataSrc: 'data.purchases',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'poNumber' },
        { data: 'supplier.name', defaultContent: 'Vendor' },
        { data: 'supplier.gstin', defaultContent: '--' },
        { data: 'orderDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'totalAmount', render: (a) => `₹${a.toFixed(2)}` },
        {
          data: 'totalAmount',
          render: (a) => `₹${(a * 0.18).toFixed(2)}` // Proxy ITC claim
        }
      ]
    });
  }

  // ─── HSN Summary Reports ─────────────────────────────────────────────────────
  async renderHSNSummary(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">HSN/SAC Summary List</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="hsnTable">
            <thead>
              <tr>
                <th>HSN/SAC Code</th>
                <th>Description</th>
                <th>Total Volume</th>
                <th>Taxable Amount (₹)</th>
                <th>CGST (₹)</th>
                <th>SGST (₹)</th>
                <th>IGST (₹)</th>
                <th>Total Tax Collections (₹)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#hsnTable').DataTable({
      ajax: {
        url: '/api/v1/gst/hsn-summary?month=6&year=2026',
        dataSrc: 'data.hsnSummary',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: '_id', defaultContent: '--' },
        { data: 'description', defaultContent: 'General goods' },
        { data: 'totalQty' },
        { data: 'taxableAmount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'cgst', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'sgst', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'igst', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'totalTax', render: (a) => `₹${a.toFixed(2)}` }
      ]
    });
  }
}

// Register globally
window.gstModule = new GSTModule();
