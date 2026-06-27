/**
 * Manufacturing Module for Inventra Enterprise ERP
 */
class ManufacturingModule {
  constructor() {
    this.table = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'work-orders') {
      return this.renderWorkOrders(container);
    }
    
    // Default: Bill of Materials (BOM)
    return this.renderBOM(container);
  }

  // ─── Bill of Materials (BOM) List & Builder ─────────────────────────────────
  async renderBOM(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">Bill of Materials (BOM)</h3>
            <p class="text-muted text-sm mb-0">Record manufacturing recipe structures, raw material ratios, and labor staging offsets.</p>
          </div>
          <button class="btn btn-primary" id="addBomBtn"><i class="bi bi-plus-lg me-1"></i>New Recipe</button>
        </div>
        
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="bomTable">
            <thead>
              <tr>
                <th>BOM Code</th>
                <th>Finished Product</th>
                <th>Estimated Lot size</th>
                <th>Calculated Cost (₹)</th>
                <th>Labor operations</th>
                <th>Staged Components</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#bomTable').DataTable({
      ajax: {
        url: '/api/v1/manufacturing/bom',
        dataSrc: 'data.boms',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'bomNumber', render: (n) => `<strong>${n}</strong>` },
        { data: 'product.name', defaultContent: 'Unknown Product' },
        { data: 'lotSize', render: (l, type, row) => `${l} ${row.product?.unit?.shortName || 'pcs'}` },
        { data: 'estimatedCost', render: (c) => `₹${c.toFixed(2)}` },
        { data: 'routing', render: (r) => `${r.length} Stages` },
        { data: 'components', render: (c) => `${c.length} Raw Materials` }
      ]
    });

    document.getElementById('addBomBtn').addEventListener('click', () => {
      window.app.showToast('BOM creation wizard is coupled to engineering specs. Add finished item twins first.', 'info');
    });
  }

  // ─── Work Orders Queue Tracking ──────────────────────────────────────────────
  async renderWorkOrders(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Production Work Orders</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="workOrdersTable">
            <thead>
              <tr>
                <th>WO Code</th>
                <th>Target Product</th>
                <th>Requested Qty</th>
                <th>Routing Stage</th>
                <th>Current Status</th>
                <th>Quality Control</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#workOrdersTable').DataTable({
      ajax: {
        url: '/api/v1/manufacturing/work-orders',
        dataSrc: 'data.workOrders',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'workOrderNumber' },
        { data: 'product.name', defaultContent: 'Finished Item' },
        { data: 'quantity' },
        { data: 'routingStage', defaultContent: 'Raw Material Allocation' },
        { data: 'status', render: (s) => `<span class="badge bg-primary">${s.toUpperCase()}</span>` },
        { data: 'qcStatus', render: (q) => `<span class="badge bg-secondary">${q.toUpperCase()}</span>` },
        {
          data: null,
          render: (row) => row.status !== 'completed' 
            ? `<button class="btn btn-xs btn-outline-success complete-wo-btn" data-id="${row._id}"><i class="bi bi-play-fill me-1"></i>Advance</button>` 
            : 'Done'
        }
      ],
      drawCallback: () => {
        $('.complete-wo-btn').on('click', async (e) => {
          const id = $(e.currentTarget).data('id');
          this.advanceWorkOrderStatus(id);
        });
      }
    });
  }

  async advanceWorkOrderStatus(woId) {
    window.app.showConfirm('Production Routing Update', 'Do you want to progress this manufacturing run? This will deduct mapped raw components and increment finished good stock.', async () => {
      try {
        const res = await window.api.post(`/manufacturing/work-orders/${woId}/progress`, {
          nextStage: 'Routing completed',
          complete: true
        });
        if (res.success) {
          window.app.showToast('Work order routing updated. Finished goods inventory twin incremented.');
          $('#workOrdersTable').DataTable().ajax.reload();
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    });
  }
}

// Register globally
window.manufacturingModule = new ManufacturingModule();
