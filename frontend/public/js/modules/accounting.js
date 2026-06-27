/**
 * Accounting Module for Inventra Enterprise ERP
 */
class AccountingModule {
  constructor() {
    this.table = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'journal') {
      return this.renderJournalEntries(container);
    } else if (subModule === 'accounts') {
      return this.renderChartOfAccounts(container);
    } else if (subModule === 'expenses') {
      return this.renderExpenses(container);
    } else if (subModule === 'profit-loss') {
      return this.renderProfitLoss(container);
    } else if (subModule === 'balance-sheet') {
      return this.renderBalanceSheet(container);
    } else if (subModule === 'trial-balance') {
      return this.renderTrialBalance(container);
    } else {
      // Default: General Ledger list
      return this.renderLedger(container);
    }
  }

  // ─── General Ledger List ─────────────────────────────────────────────────────
  async renderLedger(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">General Ledger Statements</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="ledgerTable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Description</th>
                <th>Debit (₹)</th>
                <th>Credit (₹)</th>
                <th>Balance (₹)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#ledgerTable').DataTable({
      ajax: {
        url: '/api/v1/accounting/ledger',
        dataSrc: 'data.transactions',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'transactionDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'account.code', defaultContent: '--' },
        { data: 'account.name', defaultContent: 'General Ledger Account' },
        { data: 'narration', defaultContent: '' },
        { data: 'debit', render: (d) => d > 0 ? `₹${d.toFixed(2)}` : '--' },
        { data: 'credit', render: (c) => c > 0 ? `₹${c.toFixed(2)}` : '--' },
        { data: 'runningBalance', render: (b) => `₹${(b || 0).toFixed(2)}` }
      ]
    });
  }

  // ─── Journal Entries ─────────────────────────────────────────────────────────
  async renderJournalEntries(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3 class="fw-bold header-gradient">Journal Entries</h3>
          <button class="btn btn-primary" id="addJournalBtn"><i class="bi bi-plus-lg me-1"></i>New Journal entry</button>
        </div>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="journalTable">
            <thead>
              <tr>
                <th>Entry No</th>
                <th>Date</th>
                <th>Narration</th>
                <th>Total Debit</th>
                <th>Total Credit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#journalTable').DataTable({
      ajax: {
        url: '/api/v1/accounting/journals',
        dataSrc: 'data.journals',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'journalNumber' },
        { data: 'entryDate', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'narration' },
        { data: 'totalAmount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'totalAmount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'status', render: (s) => `<span class="badge bg-success">${s.toUpperCase()}</span>` }
      ]
    });

    document.getElementById('addJournalBtn').addEventListener('click', () => {
      window.app.showToast('Please draft journal entries directly on Tally sync hooks or invoice ledger postings.', 'info');
    });
  }

  // ─── Chart of Accounts (COA) ─────────────────────────────────────────────────
  async renderChartOfAccounts(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Chart of Accounts</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="accountsTable">
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Classification</th>
                <th>Sub Group</th>
                <th>Current Balance</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#accountsTable').DataTable({
      ajax: {
        url: '/api/v1/accounting/accounts',
        dataSrc: 'data.accounts',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'code' },
        { data: 'name', render: (n) => `<strong>${n}</strong>` },
        { data: 'type', render: (t) => `<span class="badge bg-secondary">${t.toUpperCase()}</span>` },
        { data: 'group', defaultContent: 'General Ledger' },
        { data: 'balance', render: (b) => `₹${(b || 0).toFixed(2)}` }
      ]
    });
  }

  // ─── Expenses List ───────────────────────────────────────────────────────────
  async renderExpenses(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Expense Ledger Tracking</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="expensesTable">
            <thead>
              <tr>
                <th>Expense Code</th>
                <th>Date</th>
                <th>Expense Head</th>
                <th>Amount Paid</th>
                <th>Payment Mode</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#expensesTable').DataTable({
      ajax: {
        url: '/api/v1/expenses',
        dataSrc: 'data.expenses',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'expenseNumber' },
        { data: 'date', render: (d) => new Date(d).toLocaleDateString() },
        { data: 'category.name', defaultContent: 'General Expense' },
        { data: 'amount', render: (a) => `₹${a.toFixed(2)}` },
        { data: 'paymentMode', render: (m) => m.toUpperCase() }
      ]
    });
  }

  // ─── Financial Statement: Profit and Loss ────────────────────────────────────
  async renderProfitLoss(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Profit & Loss Statement (Income Statement)</h3>
        <div class="glass-card card-glow p-4" id="plWrapper">
          <div class="text-center py-5"><span class="spinner-border"></span> Parsing general ledger entries...</div>
        </div>
      </div>
    `;

    try {
      const res = await window.api.get('/accounting/profit-loss');
      if (res.success) {
        const data = res.data;
        document.getElementById('plWrapper').innerHTML = `
          <div class="d-flex justify-content-between mb-4 border-bottom pb-2">
            <h5 class="fw-bold mb-0">Financial Year P&L</h5>
            <span class="text-muted">FY ${new Date().getFullYear()} - ${new Date().getFullYear()+1}</span>
          </div>

          <div class="row g-4">
            <div class="col-md-6 border-end">
              <h6 class="fw-bold text-success border-bottom pb-2">Revenues & Inward Assets</h6>
              <div class="d-flex justify-content-between mb-2"><span>Direct Operating Sales</span><strong>₹${data.revenue.sales.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between mb-2"><span>Other Non-operating Inflow</span><strong>₹${data.revenue.other.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between border-top pt-2"><h5>Gross Revenue</h5><h5 class="text-success fw-bold">₹${data.revenue.total.toFixed(2)}</h5></div>
            </div>

            <div class="col-md-6">
              <h6 class="fw-bold text-danger border-bottom pb-2">Direct & Indirect Outward Expenses</h6>
              <div class="d-flex justify-content-between mb-2"><span>Cost of Goods Sold (COGS)</span><strong>₹${data.expense.cogs.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between mb-2"><span>Staff Remuneration (HRMS Payroll)</span><strong>₹${data.expense.salary.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between mb-2"><span>General Administrative Outlay</span><strong>₹${data.expense.admin.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between border-top pt-2"><h5>Gross Outlay</h5><h5 class="text-danger fw-bold">₹${data.expense.total.toFixed(2)}</h5></div>
            </div>
          </div>

          <div class="mt-4 pt-3 border-top d-flex justify-content-between align-items-center">
            <h4>EBITDA / Net Operating Surplus</h4>
            <h2 class="fw-bold text-glow text-${data.netProfit >= 0 ? 'success' : 'danger'}">₹${data.netProfit.toFixed(2)}</h2>
          </div>
        `;
      }
    } catch (e) {
      document.getElementById('plWrapper').innerHTML = `<div class="alert alert-danger">Failed to generate income statements: ${e.message}</div>`;
    }
  }

  // ─── Financial Statement: Balance Sheet ──────────────────────────────────────
  async renderBalanceSheet(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Balance Sheet Statement</h3>
        <div class="glass-card card-glow p-4" id="bsWrapper">
          <div class="text-center py-5"><span class="spinner-border"></span> Fetching assets & liabilities...</div>
        </div>
      </div>
    `;

    try {
      const res = await window.api.get('/accounting/balance-sheet');
      if (res.success) {
        const data = res.data;
        document.getElementById('bsWrapper').innerHTML = `
          <div class="row g-4">
            <div class="col-md-6 border-end">
              <h5 class="fw-bold text-primary border-bottom pb-2">Assets & Holdings</h5>
              <div class="d-flex justify-content-between mb-2"><span>Current Inventory Valuation</span><strong>₹${data.assets.inventory.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between mb-2"><span>Trade Accounts Receivable (Sundry Debtors)</span><strong>₹${data.assets.receivable.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between mb-2"><span>Bank & Cash Balance</span><strong>₹${data.assets.cash.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between border-top pt-2"><h4>Total Holdings</h4><h4 class="text-primary fw-bold">₹${data.assets.total.toFixed(2)}</h4></div>
            </div>

            <div class="col-md-6">
              <h5 class="fw-bold text-warning border-bottom pb-2">Liabilities & Equities</h5>
              <div class="d-flex justify-content-between mb-2"><span>Trade Accounts Payable (Sundry Creditors)</span><strong>₹${data.liabilities.payable.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between mb-2"><span>Tax Balances (GST Ledger)</span><strong>₹${data.liabilities.tax.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between mb-2"><span>Retained Earnings / Equity Surplus</span><strong>₹${data.liabilities.equity.toFixed(2)}</strong></div>
              <div class="d-flex justify-content-between border-top pt-2"><h4>Total Liabilities</h4><h4 class="text-warning fw-bold">₹${data.liabilities.total.toFixed(2)}</h4></div>
            </div>
          </div>
        `;
      }
    } catch (e) {
      document.getElementById('bsWrapper').innerHTML = `<div class="alert alert-danger">Failed to generate balance sheets: ${e.message}</div>`;
    }
  }

  // ─── Trial Balance Statement ─────────────────────────────────────────────────
  async renderTrialBalance(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Trial Balance Report</h3>
        <div class="glass-card card-glow p-4">
          <div class="table-responsive">
            <table class="table align-middle" id="trialBalanceTable">
              <thead>
                <tr>
                  <th>Account Group / Ledger</th>
                  <th style="text-align:right;">Debit Balance (₹)</th>
                  <th style="text-align:right;">Credit Balance (₹)</th>
                </tr>
              </thead>
              <tbody id="tbBody">
                <tr><td colspan="3" class="text-center py-5"><span class="spinner-border"></span> Computing ledger balances...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    try {
      const res = await window.api.get('/accounting/trial-balance');
      if (res.success) {
        const body = document.getElementById('tbBody');
        body.innerHTML = '';
        
        let debits = 0;
        let credits = 0;

        res.data.balances.forEach(b => {
          debits += b.debit;
          credits += b.credit;

          body.innerHTML += `
            <tr>
              <td><strong>${b.account}</strong></td>
              <td style="text-align:right;" class="text-success">${b.debit > 0 ? '₹' + b.debit.toFixed(2) : '--'}</td>
              <td style="text-align:right;" class="text-danger">${b.credit > 0 ? '₹' + b.credit.toFixed(2) : '--'}</td>
            </tr>
          `;
        });

        body.innerHTML += `
          <tr style="border-top: 2px solid var(--border-color); font-weight: bold; font-size:14px;">
            <td>Grand Ledger Balance Totals</td>
            <td style="text-align:right;" class="text-glow text-success">₹${debits.toFixed(2)}</td>
            <td style="text-align:right;" class="text-glow text-danger">₹${credits.toFixed(2)}</td>
          </tr>
        `;
      }
    } catch (e) {
      document.getElementById('tbBody').innerHTML = `<tr><td colspan="3" class="text-center text-danger">Failed: ${e.message}</td></tr>`;
    }
  }
}

// Register globally
window.accountingModule = new AccountingModule();
