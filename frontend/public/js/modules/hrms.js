/**
 * HRMS Module for Inventra Enterprise ERP
 */
class HRMSModule {
  constructor() {
    this.table = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'attendance') {
      return this.renderAttendance(container);
    } else if (subModule === 'leaves') {
      return this.renderLeaves(container);
    } else if (subModule === 'payroll') {
      return this.renderPayroll(container);
    } else {
      // Default: Employee list
      return this.renderEmployees(container);
    }
  }

  // ─── Employee Directory ──────────────────────────────────────────────────────
  async renderEmployees(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">Employee Directory</h3>
            <p class="text-muted text-sm mb-0">Manage corporate staff, contracts, departments, and payroll profiles.</p>
          </div>
          <button class="btn btn-primary" id="addEmpBtn"><i class="bi bi-plus-lg me-1"></i>Add Employee</button>
        </div>
        
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="employeesTable">
            <thead>
              <tr>
                <th>Emp ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Phone</th>
                <th>Salary (₹)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#employeesTable').DataTable({
      ajax: {
        url: '/api/v1/hrms/employees',
        dataSrc: 'data.employees',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'employeeId' },
        { data: 'user.name', render: (n, type, row) => `<strong>${n || row.name}</strong>` },
        { data: 'department', defaultContent: 'Operations' },
        { data: 'designation', defaultContent: 'Executive' },
        { data: 'phone', defaultContent: '--' },
        { data: 'salaryDetails.baseSalary', render: (s) => s ? `₹${s.toFixed(2)}` : 'N/A' },
        { data: 'status', render: (s) => `<span class="badge bg-success">${s}</span>` }
      ]
    });

    document.getElementById('addEmpBtn').addEventListener('click', () => {
      const name = prompt("Enter employee's name:");
      const salary = parseFloat(prompt("Enter base salary:", "25000"));
      if (name && salary) {
        window.api.post('/hrms/employees', { name, salaryDetails: { baseSalary: salary } })
          .then(res => {
            if (res.success) {
              window.app.showToast('Employee created successfully');
              $('#employeesTable').DataTable().ajax.reload();
            }
          })
          .catch(e => window.app.showToast(e.message, 'danger'));
      }
    });
  }

  // ─── Attendance Log & Check-in simulation ────────────────────────────────────
  async renderAttendance(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="row g-4">
          <div class="col-md-5">
            <div class="glass-card card-glow p-4 text-center">
              <h4 class="fw-bold mb-3 header-gradient">Biometric Check-in Terminal</h4>
              <div class="display-6 fw-bold mb-4" id="hrmsClock">00:00:00</div>
              <div class="d-flex justify-content-center gap-3">
                <button class="btn btn-lg btn-success py-3 px-4" id="checkInBtn">Check In</button>
                <button class="btn btn-lg btn-danger py-3 px-4" id="checkOutBtn">Check Out</button>
              </div>
              <p class="text-xs text-muted mt-3">Simulates biometric thumb/face check-in integration for active employees.</p>
            </div>
          </div>
          <div class="col-md-7">
            <div class="glass-card card-glow p-3">
              <h5 class="fw-bold mb-3">Live Log Feed (Biometric Integration)</h5>
              <table class="table text-xs w-100" id="attendanceTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Hours</th>
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

    // Clock
    setInterval(() => {
      const el = document.getElementById('hrmsClock');
      if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);

    const reloadAttendance = () => {
      $('#attendanceTable').DataTable({
        destroy: true,
        ajax: {
          url: '/api/v1/hrms/attendance',
          dataSrc: 'data.attendance',
          headers: window.api.getHeaders()
        },
        columns: [
          { data: 'date', render: (d) => new Date(d).toLocaleDateString() },
          { data: 'employee.user.name', defaultContent: 'Staff Member' },
          { data: 'checkIn', render: (t) => t ? new Date(t).toLocaleTimeString() : '--' },
          { data: 'checkOut', render: (t) => t ? new Date(t).toLocaleTimeString() : '--' },
          { data: 'workingHours', render: (h) => h ? `${h.toFixed(1)} hrs` : '--' },
          { data: 'status', render: (s) => `<span class="badge bg-success">${s}</span>` }
        ]
      });
    };

    reloadAttendance();

    document.getElementById('checkInBtn').onclick = async () => {
      try {
        const res = await window.api.post('/hrms/attendance/check-in', {});
        if (res.success) {
          window.app.showToast('Check-in recorded successfully', 'success');
          reloadAttendance();
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    };

    document.getElementById('checkOutBtn').onclick = async () => {
      try {
        const res = await window.api.post('/hrms/attendance/check-out', {});
        if (res.success) {
          window.app.showToast('Check-out recorded successfully', 'success');
          reloadAttendance();
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    };
  }

  // ─── Leave management ────────────────────────────────────────────────────────
  async renderLeaves(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Leave Management</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="leavesTable">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Type</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#leavesTable').DataTable({
      ajax: {
        url: '/api/v1/hrms/leaves',
        dataSrc: 'data.leaves',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'employee.user.name', defaultContent: 'Staff' },
        { data: 'leaveType' },
        { data: 'startDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'endDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'reason' },
        { data: 'status', render: (s) => `<span class="badge bg-secondary">${s}</span>` }
      ]
    });
  }

  // ─── Payroll processing ──────────────────────────────────────────────────────
  async renderPayroll(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3 class="fw-bold header-gradient">Payroll Processing & Salaries</h3>
          <button class="btn btn-outline-primary" id="runPayrollBtn">Run Monthly Payroll</button>
        </div>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="payrollTable">
            <thead>
              <tr>
                <th>Payslip ID</th>
                <th>Employee</th>
                <th>Period</th>
                <th>Base Salary</th>
                <th>Allowances</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#payrollTable').DataTable({
      ajax: {
        url: '/api/v1/hrms/payroll',
        dataSrc: 'data.slips',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'slipNumber', defaultContent: 'PSLIP' },
        { data: 'employee.user.name', defaultContent: 'Staff' },
        { data: 'month', render: (m, type, row) => `${m}/${row.year}` },
        { data: 'baseSalary', render: (s) => `₹${s.toFixed(2)}` },
        { data: 'allowances', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'deductions', render: (d) => `₹${d.toFixed(2)}` },
        { data: 'netSalary', render: (n) => `₹${n.toFixed(2)}` },
        { data: 'status', render: (s) => `<span class="badge bg-success">${s}</span>` }
      ]
    });

    document.getElementById('runPayrollBtn').addEventListener('click', () => {
      window.app.showConfirm('Execute Monthly Payroll', 'Do you want to run salary processing routines for the current calendar period?', async () => {
        try {
          const res = await window.api.post('/hrms/payroll/run', { month: new Date().getMonth() + 1, year: new Date().getFullYear() });
          if (res.success) {
            window.app.showToast('Payroll processed. Payslips generated.');
            $('#payrollTable').DataTable().ajax.reload();
          }
        } catch (e) {
          window.app.showToast(e.message, 'danger');
        }
      });
    });
  }
}

// Register globally
window.hrmsModule = new HRMSModule();
