/**
 * Administration Module for Inventra Enterprise ERP
 */
class AdminModule {
  constructor() {
    this.table = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'branches') {
      return this.renderBranches(container);
    } else if (subModule === 'company') {
      return this.renderCompanySettings(container);
    } else {
      // Default: Users & Roles
      return this.renderUsers(container);
    }
  }

  // ─── Users & Roles Directory ────────────────────────────────────────────────
  async renderUsers(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">Users & Access Roles</h3>
            <p class="text-muted text-sm mb-0">Configure tenant access control, allocate roles, and assign branch clearances.</p>
          </div>
          <button class="btn btn-primary" id="addUserBtn"><i class="bi bi-plus-lg me-1"></i>Add Staff Member</button>
        </div>
        
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="usersTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email Address</th>
                <th>Access Level</th>
                <th>Primary Branch</th>
                <th>Auth Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#usersTable').DataTable({
      ajax: {
        url: '/api/v1/users',
        dataSrc: 'data.users',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'name', render: (n) => `<strong>${n}</strong>` },
        { data: 'email' },
        { data: 'role.name', defaultContent: 'Operator / Staff' },
        { data: 'branch.name', defaultContent: 'Headquarters' },
        {
          data: 'isActive',
          render: (a) => `<span class="badge bg-${a ? 'success' : 'secondary'}">${a ? 'Verified' : 'Disabled'}</span>`
        }
      ]
    });

    document.getElementById('addUserBtn').addEventListener('click', () => {
      const name = prompt("Enter employee's name:");
      const email = prompt("Enter email address:");
      const password = prompt("Assign temporary password (Min 8 chars, incl Uppercase/Digit):", "Welcome@123");
      if (name && email && password) {
        window.api.post('/users', { name, email, password })
          .then(res => {
            if (res.success) {
              window.app.showToast('User created successfully');
              $('#usersTable').DataTable().ajax.reload();
            }
          })
          .catch(e => window.app.showToast(e.message, 'danger'));
      }
    });
  }

  // ─── Company Profile Settings ────────────────────────────────────────────────
  async renderCompanySettings(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Company Information</h3>
        <div class="glass-card card-glow p-4">
          <form id="companySettingsForm">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Legal Organization Name</label>
                <input type="text" id="cfgCompName" class="form-control" required>
              </div>
              <div class="col-md-6">
                <label class="form-label">Company GSTIN Number</label>
                <input type="text" id="cfgCompGstin" class="form-control" placeholder="07AAAAA1111A1Z1">
              </div>
              <div class="col-md-6">
                <label class="form-label">Corporate Email ID</label>
                <input type="email" id="cfgCompEmail" class="form-control">
              </div>
              <div class="col-md-6">
                <label class="form-label">Support Contact phone</label>
                <input type="text" id="cfgCompPhone" class="form-control">
              </div>
              <div class="col-12">
                <label class="form-label">Registered Headquarters Address</label>
                <textarea id="cfgCompAddress" class="form-control" rows="2"></textarea>
              </div>
              <div class="col-12 mt-4">
                <button type="submit" class="btn btn-primary" id="saveCompConfigBtn">Save Corporate Profile</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    try {
      const activeId = window.auth.getActiveCompanyId();
      const res = await window.api.get(`/companies/${activeId}`);
      if (res.success && res.data.company) {
        const c = res.data.company;
        document.getElementById('cfgCompName').value = c.name || '';
        document.getElementById('cfgCompGstin').value = c.gst?.gstin || '';
        document.getElementById('cfgCompEmail').value = c.email || '';
        document.getElementById('cfgCompPhone').value = c.phone || '';
        document.getElementById('cfgCompAddress').value = c.address || '';
      }
    } catch (e) {
      console.warn('Failed loading company profiles:', e);
    }

    document.getElementById('companySettingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const activeId = window.auth.getActiveCompanyId();
      const payload = {
        name: document.getElementById('cfgCompName').value,
        email: document.getElementById('cfgCompEmail').value,
        phone: document.getElementById('cfgCompPhone').value,
        address: document.getElementById('cfgCompAddress').value,
        gst: {
          gstin: document.getElementById('cfgCompGstin').value
        }
      };

      try {
        const res = await window.api.put(`/companies/${activeId}`, payload);
        if (res.success) {
          window.app.showToast('Company configurations saved successfully');
          window.app.updateUserUI(); // refresh name on sidebar
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    });
  }

  // ─── Branches list ───────────────────────────────────────────────────────────
  async renderBranches(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3 class="fw-bold header-gradient">Corporate Branches</h3>
          <button class="btn btn-primary" id="addBranchBtn">Add Branch</button>
        </div>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="branchesTable">
            <thead>
              <tr>
                <th>Branch Name</th>
                <th>Branch Code</th>
                <th>Location Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#branchesTable').DataTable({
      ajax: {
        url: '/api/v1/branches',
        dataSrc: 'data.branches',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'name', render: (n) => `<strong>${n}</strong>` },
        { data: 'code' },
        { data: 'address', defaultContent: 'HQ Outpost' },
        {
          data: '_id',
          render: (id) => `<button class="btn btn-xs btn-outline-secondary switch-branch-btn" data-id="${id}">Switch to</button>`
        }
      ],
      drawCallback: () => {
        $('.switch-branch-btn').on('click', (e) => {
          const id = $(e.currentTarget).data('id');
          window.auth.changeBranch(id);
        });
      }
    });

    document.getElementById('addBranchBtn').addEventListener('click', () => {
      const name = prompt("Enter branch name:");
      const code = prompt("Enter branch code:");
      if (name && code) {
        window.api.post('/branches', { name, code })
          .then(res => {
            if (res.success) {
              window.app.showToast('Corporate branch added');
              $('#branchesTable').DataTable().ajax.reload();
            }
          })
          .catch(e => window.app.showToast(e.message, 'danger'));
      }
    });
  }
}

// Register globally
window.adminModule = new AdminModule();
