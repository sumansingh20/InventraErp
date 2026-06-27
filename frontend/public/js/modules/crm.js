/**
 * CRM Module for Inventra Enterprise ERP
 */
class CRMModule {
  constructor() {
    this.table = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'opportunities') {
      return this.renderOpportunities(container);
    } else if (subModule === 'activities') {
      return this.renderActivities(container);
    } else {
      // Default: Leads funnel
      return this.renderLeads(container);
    }
  }

  // ─── Leads funnel ────────────────────────────────────────────────────────────
  async renderLeads(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">Sales Pipeline & Leads</h3>
            <p class="text-muted text-sm mb-0">Record raw client interest, track conversions, and plan follow-ups.</p>
          </div>
          <button class="btn btn-primary" id="addLeadBtn"><i class="bi bi-plus-lg me-1"></i>New Lead</button>
        </div>
        
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="leadsTable">
            <thead>
              <tr>
                <th>Lead Name</th>
                <th>Company</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Source</th>
                <th>Est. Value (₹)</th>
                <th>Stage</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#leadsTable').DataTable({
      ajax: {
        url: '/api/v1/crm/leads',
        dataSrc: 'data.leads',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'name', render: (n) => `<strong>${n}</strong>` },
        { data: 'companyName', defaultContent: '--' },
        { data: 'phone', defaultContent: '--' },
        { data: 'email', defaultContent: '--' },
        { data: 'source', render: (s) => s.toUpperCase() },
        { data: 'estimatedValue', render: (v) => `₹${(v || 0).toLocaleString('en-IN')}` },
        { data: 'status', render: (s) => `<span class="badge bg-info">${s.toUpperCase()}</span>` }
      ]
    });

    document.getElementById('addLeadBtn').addEventListener('click', () => {
      const name = prompt("Enter contact name:");
      const val = parseFloat(prompt("Enter estimated opportunity value (₹):", "50000"));
      if (name && val) {
        window.api.post('/crm/leads', { name, estimatedValue: val })
          .then(res => {
            if (res.success) {
              window.app.showToast('Lead recorded in sales funnel');
              $('#leadsTable').DataTable().ajax.reload();
            }
          })
          .catch(e => window.app.showToast(e.message, 'danger'));
      }
    });
  }

  // ─── Opportunities list ──────────────────────────────────────────────────────
  async renderOpportunities(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">High Value Opportunities</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="oppsTable">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Opportunity Name</th>
                <th>Calculated Value</th>
                <th>Confidence (%)</th>
                <th>Closed Date</th>
                <th>Current Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#oppsTable').DataTable({
      ajax: {
        url: '/api/v1/crm/opportunities',
        dataSrc: 'data.opportunities',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'lead.name', defaultContent: '--' },
        { data: 'title', render: (t) => `<strong>${t}</strong>` },
        { data: 'value', render: (v) => `₹${v.toFixed(2)}` },
        { data: 'probability', render: (p) => `${p}%` },
        { data: 'expectedCloseDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'status', render: (s) => `<span class="badge bg-warning">${s}</span>` }
      ]
    });
  }

  // ─── CRM Staged Activities ───────────────────────────────────────────────────
  async renderActivities(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Client Communications & Activities</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="actsTable">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Lead / Opportunity</th>
                <th>Type</th>
                <th>Summary Description</th>
                <th>Logged By</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#actsTable').DataTable({
      ajax: {
        url: '/api/v1/crm/activities',
        dataSrc: 'data.activities',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'createdAt', render: (d) => new Date(d).toLocaleString() },
        { data: 'lead.name', defaultContent: '--' },
        { data: 'type', render: (t) => `<span class="badge bg-secondary">${t.toUpperCase()}</span>` },
        { data: 'description' },
        { data: 'assignedTo.name', defaultContent: 'Representative' }
      ]
    });
  }
}

// Register globally
window.crmModule = new CRMModule();
