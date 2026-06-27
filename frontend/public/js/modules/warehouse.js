/**
 * Warehouse Module for Inventra Enterprise ERP
 */
class WarehouseModule {
  constructor() {
    this.table = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'zones') {
      return this.renderZones(container);
    } else if (subModule === 'transfers') {
      return this.renderTransfers(container);
    } else {
      // Default: Warehouses list
      return this.renderWarehouses(container);
    }
  }

  // ─── Warehouses List ─────────────────────────────────────────────────────────
  async renderWarehouses(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">Warehouses Master</h3>
            <p class="text-muted text-sm mb-0">Record unlimited warehouse footprints, optimize internal staging, and track branch linkages.</p>
          </div>
          <button class="btn btn-primary" id="addWhBtn"><i class="bi bi-plus-lg me-1"></i>New Warehouse</button>
        </div>
        
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="warehousesTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Location</th>
                <th>Associated Branch</th>
                <th>Staged Zones</th>
                <th>Current Stock Capacity</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#warehousesTable').DataTable({
      ajax: {
        url: '/api/v1/warehouses',
        dataSrc: 'data.warehouses',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'name', render: (n) => `<strong>${n}</strong>` },
        { data: 'code' },
        { data: 'address', defaultContent: 'HQ Compound' },
        { data: 'branch.name', defaultContent: 'General Headquarters' },
        { data: 'zonesCount', defaultContent: '4 Zones' },
        { data: 'capacityUsage', defaultContent: 'Optimal' }
      ]
    });

    document.getElementById('addWhBtn').addEventListener('click', () => {
      const name = prompt("Enter warehouse name:");
      const code = prompt("Enter warehouse code:");
      if (name && code) {
        window.api.post('/warehouses', { name, code })
          .then(res => {
            if (res.success) {
              window.app.showToast('Warehouse footwork profile created');
              $('#warehousesTable').DataTable().ajax.reload();
            }
          })
          .catch(e => window.app.showToast(e.message, 'danger'));
      }
    });
  }

  // ─── Storage Zones & Bins ────────────────────────────────────────────────────
  async renderZones(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Staging Zones & Bins Layout</h3>
        <div class="glass-card card-glow p-4">
          <div class="text-center py-5">
            <i class="bi bi-diagram-3 display-3 text-muted"></i>
            <h5 class="fw-bold mt-3">Interactive Warehouse Zoning</h5>
            <p class="text-muted text-sm">Select a warehouse under your corporate settings page to configure specific storage coordinates.</p>
          </div>
        </div>
      </div>
    `;
  }

  // ─── Internal stock transfers ────────────────────────────────────────────────
  async renderTransfers(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="row g-4">
          <div class="col-md-5">
            <div class="glass-card card-glow p-4">
              <h5 class="fw-bold mb-3 border-bottom pb-2">Record Inter-Warehouse Transfer</h5>
              <form id="transferForm">
                <div class="mb-3">
                  <label class="form-label">Transfer Product</label>
                  <select id="tfProduct" class="form-select" required></select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Source Warehouse</label>
                  <select id="tfSource" class="form-select" required></select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Target Warehouse</label>
                  <select id="tfTarget" class="form-select" required></select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Transfer Quantity</label>
                  <input type="number" id="tfQty" class="form-control" min="1" value="1" required>
                </div>
                <button type="submit" class="btn btn-primary w-100">Initiate Transit Transfer</button>
              </form>
            </div>
          </div>
          <div class="col-md-7">
            <div class="glass-card card-glow p-3">
              <h5 class="fw-bold mb-3">Live Transit Logs</h5>
              <table class="table text-xs w-100" id="transfersTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Source</th>
                    <th>Target</th>
                    <th>Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    // Populate selects
    const prods = await window.api.get('/products');
    const whs = await window.api.get('/warehouses');

    const pSel = document.getElementById('tfProduct');
    const sSel = document.getElementById('tfSource');
    const tSel = document.getElementById('tfTarget');

    prods.data.products.forEach(p => {
      pSel.innerHTML += `<option value="${p._id}">${p.name}</option>`;
    });

    whs.data.warehouses.forEach(w => {
      sSel.innerHTML += `<option value="${w._id}">${w.name}</option>`;
      tSel.innerHTML += `<option value="${w._id}">${w.name}</option>`;
    });

    const reloadTransfersTable = () => {
      $('#transfersTable').DataTable({
        destroy: true,
        ajax: {
          url: '/api/v1/inventory/movements?type=transfer',
          dataSrc: 'data.movements',
          headers: window.api.getHeaders()
        },
        columns: [
          { data: 'createdAt', render: (d) => new Date(d).toLocaleDateString() },
          { data: 'product.name', defaultContent: 'Product' },
          { data: 'warehouse.name', defaultContent: 'HQ Whse' },
          { data: 'reference', defaultContent: 'Transfer Target' },
          { data: 'quantity', render: (q) => Math.abs(q) },
          { data: 'type', render: (s) => `<span class="badge bg-info">${s}</span>` }
        ]
      });
    };

    reloadTransfersTable();

    document.getElementById('transferForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        productId: document.getElementById('tfProduct').value,
        sourceWarehouseId: document.getElementById('tfSource').value,
        targetWarehouseId: document.getElementById('tfTarget').value,
        quantity: parseInt(document.getElementById('tfQty').value)
      };

      if (payload.sourceWarehouseId === payload.targetWarehouseId) {
        window.app.showToast('Source and Target warehouses must be different', 'warning');
        return;
      }

      try {
        const res = await window.api.post('/inventory/transfer', payload);
        if (res.success) {
          window.app.showToast('Stock transfer initiated. Quantities shifted.');
          reloadTransfersTable();
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    });
  }
}

// Register globally
window.warehouseModule = new WarehouseModule();
