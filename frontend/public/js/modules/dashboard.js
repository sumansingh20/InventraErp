/**
 * Inventra Enterprise ERP — Dashboard Module
 * Premium executive dashboard with KPIs, charts, activity feed
 * Version: 3.0.0
 */
class DashboardModule {
  constructor() {
    this.salesChart   = null;
    this.pieChart     = null;
    this._period      = 'this-month';
    this._refreshTimer = null;
  }

  async render(subModule, query, container) {
    this._destroy();

    const user = window.auth.getUser();
    const greeting = this._getGreeting();
    const now = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">${greeting}, ${(user?.name || 'User').split(' ')[0]} 👋</h1>
          <p class="page-subtitle" id="dashTimestamp">${now} · Real-time data</p>
        </div>
        <div class="page-header-actions">
          <div style="display:flex;align-items:center;gap:8px;">
            <select class="form-control form-control-sm" id="dashboardPeriod" style="width:150px;">
              <option value="today">Today</option>
              <option value="this-week">This Week</option>
              <option value="this-month" selected>This Month</option>
              <option value="this-quarter">This Quarter</option>
              <option value="this-year">This Year</option>
            </select>
            <button class="btn btn-outline" id="refreshDashboardBtn" title="Refresh data">
              <i class="bi bi-arrow-clockwise"></i>
              <span class="d-none d-sm-inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;" id="kpiGrid">
        ${this._kpiSkeletons()}
      </div>

      <!-- Secondary KPIs -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;" id="kpiSecondaryGrid">
        ${this._kpiSkeletons(4, 80)}
      </div>

      <!-- Charts Row -->
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:24px;">
        <div class="card">
          <div class="card-header">
            <div>
              <span class="card-title">Revenue vs Expenses</span>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">Monthly comparison</div>
            </div>
            <div style="display:flex;gap:12px;align-items:center;">
              <span style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--color-text-muted);">
                <span style="width:10px;height:10px;border-radius:2px;background:var(--indigo-500);display:inline-block;"></span>Revenue
              </span>
              <span style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--color-text-muted);">
                <span style="width:10px;height:10px;border-radius:2px;background:var(--emerald-500);display:inline-block;"></span>Purchases
              </span>
              <span class="badge badge-primary badge-dot">Live</span>
            </div>
          </div>
          <div class="card-body" style="padding-top:8px;">
            <div class="chart-container" style="height:280px;">
              <canvas id="salesPurchaseChart"></canvas>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Inventory Value</span>
            <span class="badge badge-neutral">by Category</span>
          </div>
          <div class="card-body" style="display:flex;align-items:center;justify-content:center;">
            <div class="chart-container" style="height:260px;width:100%;">
              <canvas id="inventoryPieChart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Row: Recent Sales + Low Stock + Activity -->
      <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:20px;">
        <!-- Recent Sales -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Recent Invoices</span>
            <a href="#" data-route="sales/invoices" class="btn btn-ghost-primary btn-sm">View All</a>
          </div>
          <div class="data-table-scroll">
            <table class="data-table" id="recentSalesTable">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="recentSalesBody">
                ${[1,2,3,4,5].map(() => `
                  <tr>
                    <td><div class="skeleton skeleton-text" style="width:70px;"></div></td>
                    <td><div class="skeleton skeleton-text" style="width:90px;"></div></td>
                    <td><div class="skeleton skeleton-text" style="width:60px;"></div></td>
                    <td><div class="skeleton skeleton-text" style="width:50px;"></div></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Low Stock -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">⚠️ Low Stock</span>
            <a href="#" data-route="inventory/stock" class="btn btn-ghost-primary btn-sm">View All</a>
          </div>
          <div style="padding:0 4px;" id="lowStockList">
            ${[1,2,3,4].map(() => `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--color-border-subtle);">
                <div class="skeleton skeleton-circle" style="width:32px;height:32px;flex-shrink:0;"></div>
                <div style="flex:1;">
                  <div class="skeleton skeleton-text" style="width:80%;margin-bottom:4px;"></div>
                  <div class="skeleton skeleton-text sm" style="width:50%;"></div>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Activity Feed -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Activity Feed</span>
            <span class="badge badge-primary badge-dot">Live</span>
          </div>
          <div style="overflow-y:auto;max-height:320px;" id="activityFeed">
            ${[1,2,3,4].map(() => `
              <div style="display:flex;gap:10px;padding:10px 16px;border-bottom:1px solid var(--color-border-subtle);">
                <div class="skeleton skeleton-circle" style="width:28px;height:28px;flex-shrink:0;"></div>
                <div style="flex:1;">
                  <div class="skeleton skeleton-text" style="width:90%;margin-bottom:4px;"></div>
                  <div class="skeleton skeleton-text sm" style="width:40%;"></div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `;

    // Load data
    await this._loadAllData(container);

    // Wire period change
    document.getElementById('dashboardPeriod')?.addEventListener('change', async e => {
      this._period = e.target.value;
      await this._loadAllData(container);
    });

    // Wire refresh
    document.getElementById('refreshDashboardBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('refreshDashboardBtn');
      const icon = btn?.querySelector('i');
      if (icon) icon.classList.add('anim-spin');
      await this._loadAllData(container);
      setTimeout(() => icon?.classList.remove('anim-spin'), 800);
    });

    // Auto-refresh every 60 seconds
    this._refreshTimer = setInterval(() => this._loadAllData(container), 60000);
  }

  /* ── Data Loading ──────────────────────────────────────────── */
  async _loadAllData(container) {
    try {
      const [dashRes, lowStockRes, salesRes] = await Promise.allSettled([
        window.api.get(`/dashboard/stats?period=${this._period}`),
        window.api.get('/products?lowStock=true&limit=6&sort=currentStock'),
        window.api.get('/sales/invoices?limit=5&sort=-createdAt'),
      ]);

      const stats    = dashRes.status === 'fulfilled' && dashRes.value.success ? dashRes.value.data : {};
      const lowStock = lowStockRes.status === 'fulfilled' && lowStockRes.value.success ? lowStockRes.value.data.products || [] : [];
      const sales    = salesRes.status === 'fulfilled' && salesRes.value.success ? salesRes.value.data.invoices || [] : [];

      this._renderKPIs(stats);
      this._renderSecondaryKPIs(stats);
      this._renderRevenueChart(stats);
      this._renderPieChart(stats);
      this._renderRecentSales(sales);
      this._renderLowStock(lowStock);
      this._renderActivityFeed(stats.recentActivity || []);

      // Update sidebar low stock badge
      window.app?.updateLowStockBadge?.(stats.lowStockCount || 0);

    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  }

  /* ── KPI Rendering ──────────────────────────────────────────── */
  _renderKPIs(stats) {
    const kpiGrid = document.getElementById('kpiGrid');
    if (!kpiGrid) return;

    const revenue   = stats.totalSales    || 0;
    const purchases = stats.totalPurchases || 0;
    const profit    = stats.netProfit     || (revenue - purchases);
    const margin    = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
    const lowStock  = stats.lowStockCount || 0;
    const outStock  = stats.outOfStockCount || 0;

    const salesChange     = stats.salesChangePercent     ?? 0;
    const purchaseChange  = stats.purchaseChangePercent  ?? 0;
    const profitChange    = stats.profitChangePercent    ?? 0;

    kpiGrid.innerHTML = `
      ${this._kpiCard({
        id: 'kpiSales',
        label: 'Total Revenue',
        value: this._formatCurrency(revenue),
        change: salesChange,
        changeLabel: 'vs prev period',
        icon: 'bi-currency-rupee',
        accentColor: 'var(--indigo-500)',
        iconBg: 'var(--color-primary-subtle)',
        iconColor: 'var(--color-primary)',
      })}
      ${this._kpiCard({
        id: 'kpiPurchases',
        label: 'Total Purchases',
        value: this._formatCurrency(purchases),
        change: purchaseChange,
        changeLabel: 'vs prev period',
        icon: 'bi-cart',
        accentColor: 'var(--emerald-500)',
        iconBg: 'var(--color-success-subtle)',
        iconColor: 'var(--color-success)',
        changeInverse: true,
      })}
      ${this._kpiCard({
        id: 'kpiProfit',
        label: 'Net Profit',
        value: this._formatCurrency(profit),
        change: profitChange,
        changeLabel: `${margin}% margin`,
        icon: 'bi-graph-up-arrow',
        accentColor: 'var(--amber-500)',
        iconBg: 'var(--color-warning-subtle)',
        iconColor: 'var(--color-warning)',
      })}
      ${this._kpiCardAlert({
        id: 'kpiLowStock',
        label: 'Stock Alerts',
        mainValue: lowStock,
        mainLabel: 'Low Stock',
        subValue: outStock,
        subLabel: 'Out of Stock',
        icon: 'bi-exclamation-triangle',
        accentColor: 'var(--rose-500)',
        iconBg: 'var(--color-danger-subtle)',
        iconColor: 'var(--color-danger)',
        route: 'inventory/stock',
      })}
    `;

    // Animate values in
    kpiGrid.querySelectorAll('.kpi-value').forEach(el => {
      el.style.animation = 'countUp 0.4s ease both';
    });
  }

  _kpiCard({ id, label, value, change, changeLabel, icon, accentColor, iconBg, iconColor, changeInverse = false }) {
    const isPositive = changeInverse ? change <= 0 : change >= 0;
    const changeClass = isPositive ? 'up' : 'down';
    const changeIcon  = change >= 0 ? 'bi-arrow-up-short' : 'bi-arrow-down-short';
    const changeAbs   = Math.abs(change || 0).toFixed(1);

    return `
      <div class="kpi-card" style="--kpi-accent:${accentColor};--kpi-icon-bg:${iconBg};">
        <div class="kpi-card-header">
          <div class="kpi-label">${label}</div>
          <div class="kpi-icon" style="background:${iconBg};color:${iconColor};">
            <i class="bi ${icon}"></i>
          </div>
        </div>
        <div class="kpi-value" id="${id}">${value}</div>
        <div class="kpi-change ${changeClass}">
          <i class="bi ${changeIcon}"></i>
          <span>${changeAbs}%</span>
          <span class="kpi-change-context">${changeLabel}</span>
        </div>
      </div>
    `;
  }

  _kpiCardAlert({ id, label, mainValue, mainLabel, subValue, subLabel, icon, accentColor, iconBg, iconColor, route }) {
    return `
      <div class="kpi-card" style="--kpi-accent:${accentColor};cursor:pointer;" onclick="window.app.navigate('${route}')">
        <div class="kpi-card-header">
          <div class="kpi-label">${label}</div>
          <div class="kpi-icon" style="background:${iconBg};color:${iconColor};">
            <i class="bi ${icon}"></i>
          </div>
        </div>
        <div class="kpi-value" id="${id}" style="color:${accentColor};">${mainValue}</div>
        <div class="kpi-change" style="margin-top:6px;">
          <span style="color:var(--color-text-secondary);font-size:12px;">${mainLabel}</span>
          <span style="margin-left:auto;color:${accentColor};font-size:11px;font-weight:600;">${subValue} ${subLabel}</span>
        </div>
      </div>
    `;
  }

  _renderSecondaryKPIs(stats) {
    const grid = document.getElementById('kpiSecondaryGrid');
    if (!grid) return;

    const paid    = stats.paidInvoicesCount    || 0;
    const unpaid  = stats.unpaidInvoicesCount  || 0;
    const orders  = stats.totalOrders          || 0;
    const customers = stats.totalCustomers     || 0;

    grid.innerHTML = `
      <div class="card" style="padding:16px;display:flex;align-items:center;gap:14px;flex-direction:row;">
        <div style="width:40px;height:40px;border-radius:12px;background:var(--color-success-subtle);color:var(--color-success);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
          <i class="bi bi-check-circle-fill"></i>
        </div>
        <div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--color-text-primary);">${paid}</div>
          <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Paid Invoices</div>
        </div>
      </div>
      <div class="card" style="padding:16px;display:flex;align-items:center;gap:14px;flex-direction:row;">
        <div style="width:40px;height:40px;border-radius:12px;background:var(--color-danger-subtle);color:var(--color-danger);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
          <i class="bi bi-clock-history"></i>
        </div>
        <div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--color-text-primary);">${unpaid}</div>
          <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Unpaid / Overdue</div>
        </div>
      </div>
      <div class="card" style="padding:16px;display:flex;align-items:center;gap:14px;flex-direction:row;">
        <div style="width:40px;height:40px;border-radius:12px;background:var(--color-info-subtle);color:var(--color-info);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
          <i class="bi bi-bag-check"></i>
        </div>
        <div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--color-text-primary);">${orders}</div>
          <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Sales Orders</div>
        </div>
      </div>
      <div class="card" style="padding:16px;display:flex;align-items:center;gap:14px;flex-direction:row;">
        <div style="width:40px;height:40px;border-radius:12px;background:var(--color-secondary-muted);color:var(--color-secondary);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
          <i class="bi bi-people-fill"></i>
        </div>
        <div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--color-text-primary);">${customers}</div>
          <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Total Customers</div>
        </div>
      </div>
    `;
  }

  /* ── Charts ───────────────────────────────────────────────── */
  _renderRevenueChart(stats) {
    const canvas = document.getElementById('salesPurchaseChart');
    if (!canvas) return;

    this.salesChart?.destroy();

    const labels  = stats.chartLabels  || this._defaultMonths();
    const revenue = stats.salesData    || this._emptyArr(labels.length);
    const costs   = stats.purchaseData || this._emptyArr(labels.length);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    this.salesChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Revenue',
            data: revenue,
            backgroundColor: 'hsla(243, 75%, 59%, 0.85)',
            hoverBackgroundColor: 'hsl(243, 75%, 59%)',
            borderRadius: 6,
            borderSkipped: false,
            order: 2,
          },
          {
            label: 'Purchases',
            data: costs,
            backgroundColor: 'hsla(160, 84%, 39%, 0.7)',
            hoverBackgroundColor: 'hsl(160, 84%, 39%)',
            borderRadius: 6,
            borderSkipped: false,
            order: 3,
          },
          {
            label: 'Net Profit',
            data: revenue.map((r, i) => r - (costs[i] || 0)),
            type: 'line',
            borderColor: 'hsl(38, 92%, 55%)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'hsl(38, 92%, 55%)',
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            tension: 0.4,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: isDark ? 'hsl(222, 35%, 11%)' : 'hsl(222, 47%, 11%)',
            titleColor: '#fff',
            bodyColor: 'rgba(255,255,255,0.7)',
            borderColor: isDark ? 'hsl(222, 25%, 18%)' : 'hsl(215, 25%, 27%)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 12,
            titleFont: { family: "'Inter', sans-serif", size: 12, weight: '600' },
            bodyFont: { family: "'Inter', sans-serif", size: 12 },
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${this._formatCurrency(ctx.raw)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor, drawBorder: false },
            ticks: { color: textColor, font: { family: "'Inter'", size: 11 } },
          },
          y: {
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: textColor,
              font: { family: "'Inter'", size: 11 },
              callback: v => '₹' + this._formatNumber(v),
            },
          },
        },
      },
    });
  }

  _renderPieChart(stats) {
    const canvas = document.getElementById('inventoryPieChart');
    if (!canvas) return;

    this.pieChart?.destroy();

    const categories = stats.inventoryByCategory || [
      { name: 'Electronics',   value: 45 },
      { name: 'Clothing',      value: 20 },
      { name: 'Accessories',   value: 15 },
      { name: 'Food & Bev',    value: 12 },
      { name: 'Other',         value: 8  },
    ];

    const labels     = categories.map(c => c.name);
    const values     = categories.map(c => c.value);
    const bgColors   = [
      'hsl(243,75%,59%)', 'hsl(160,84%,39%)', 'hsl(38,92%,50%)',
      'hsl(350,89%,60%)', 'hsl(199,89%,48%)', 'hsl(262,83%,58%)',
    ];

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    this.pieChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: bgColors,
          hoverBackgroundColor: bgColors,
          borderWidth: 0,
          hoverBorderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: { family: "'Inter'", size: 11 },
              boxWidth: 10,
              boxHeight: 10,
              borderRadius: 3,
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            backgroundColor: isDark ? 'hsl(222, 35%, 11%)' : 'hsl(222, 47%, 11%)',
            titleColor: '#fff',
            bodyColor: 'rgba(255,255,255,0.7)',
            borderWidth: 0,
            padding: 12,
            cornerRadius: 12,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.formattedValue}%`,
            },
          },
        },
      },
    });
  }

  /* ── Recent Sales Table ─────────────────────────────────────── */
  _renderRecentSales(sales) {
    const tbody = document.getElementById('recentSalesBody');
    if (!tbody) return;

    if (!sales.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center;padding:32px;color:var(--color-text-muted);">
            No invoices yet
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = sales.map(s => `
      <tr style="cursor:pointer;" onclick="window.app.navigate('sales/invoices','view:${s._id}')">
        <td>
          <span style="font-family:var(--font-mono);font-size:12px;color:var(--color-primary);">
            ${s.invoiceNumber || s._id?.slice(-6).toUpperCase()}
          </span>
        </td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${s.customer?.name || 'Walk-In'}
        </td>
        <td style="font-weight:600;font-family:var(--font-display);">
          ${this._formatCurrency(s.totalAmount || 0)}
        </td>
        <td>
          <span class="status-badge status-${(s.paymentStatus || 'pending').toLowerCase().replace(' ', '_')}">
            ${s.paymentStatus || 'Pending'}
          </span>
        </td>
      </tr>
    `).join('');
  }

  /* ── Low Stock List ─────────────────────────────────────────── */
  _renderLowStock(products) {
    const container = document.getElementById('lowStockList');
    if (!container) return;

    if (!products.length) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:32px 16px;color:var(--color-text-muted);">
          <i class="bi bi-check-circle" style="font-size:32px;color:var(--color-success);margin-bottom:8px;opacity:0.6;"></i>
          <span style="font-size:13px;">All stock levels are healthy</span>
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(p => {
      const pct  = p.minStockLevel > 0 ? Math.min(100, (p.currentStock / p.minStockLevel) * 100) : 0;
      const color = p.currentStock === 0 ? 'var(--color-danger)' : 'var(--color-warning)';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--color-border-subtle);cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='var(--color-surface-overlay)'" onmouseleave="this.style.background=''" onclick="window.app.navigate('inventory/products','view:${p._id}')">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--color-surface-overlay);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">
            ${p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : '📦'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
              <div style="flex:1;height:3px;background:var(--color-surface-overlay);border-radius:999px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:999px;"></div>
              </div>
              <span style="font-size:11px;font-weight:700;color:${color};">${p.currentStock} left</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Activity Feed ──────────────────────────────────────────── */
  _renderActivityFeed(activities) {
    const container = document.getElementById('activityFeed');
    if (!container) return;

    if (!activities.length) {
      activities = this._mockActivities();
    }

    const icons = {
      sale:     { icon: 'bi-receipt', bg: 'var(--color-primary-subtle)', color: 'var(--color-primary)' },
      purchase: { icon: 'bi-cart',    bg: 'var(--color-success-subtle)', color: 'var(--color-success)' },
      stock:    { icon: 'bi-box-seam', bg: 'var(--color-warning-subtle)', color: 'var(--color-warning)' },
      user:     { icon: 'bi-person',  bg: 'var(--color-info-subtle)',    color: 'var(--color-info)' },
      alert:    { icon: 'bi-exclamation-triangle', bg: 'var(--color-danger-subtle)', color: 'var(--color-danger)' },
    };

    container.innerHTML = activities.map(a => {
      const meta = icons[a.type] || icons.user;
      return `
        <div style="display:flex;gap:10px;padding:10px 16px;border-bottom:1px solid var(--color-border-subtle);">
          <div style="width:28px;height:28px;border-radius:8px;background:${meta.bg};color:${meta.color};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">
            <i class="bi ${meta.icon}"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;color:var(--color-text-primary);line-height:1.4;">${a.message}</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${window.app.formatRelativeTime(a.time || new Date().toISOString())}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Helpers ────────────────────────────────────────────────── */
  _getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  _formatCurrency(value) {
    if (value >= 1e7)  return `₹${(value / 1e7).toFixed(2)} Cr`;
    if (value >= 1e5)  return `₹${(value / 1e5).toFixed(2)} L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${Number(value).toFixed(2)}`;
  }

  _formatNumber(n) {
    if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n;
  }

  _defaultMonths() {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date().getMonth();
    const out = [];
    for (let i = 5; i >= 0; i--) {
      out.push(months[(now - i + 12) % 12]);
    }
    return out;
  }

  _emptyArr(len) { return Array(len).fill(0); }

  _kpiSkeletons(count = 4, height = 120) {
    return Array(count).fill(0).map(() =>
      `<div class="skeleton" style="height:${height}px;border-radius:16px;"></div>`
    ).join('');
  }

  _mockActivities() {
    return [
      { type: 'sale',     message: 'Invoice #INV-2401 created for Raj Enterprises', time: new Date(Date.now() - 2 * 60000).toISOString() },
      { type: 'purchase', message: 'PO #PO-0089 received from Global Traders', time: new Date(Date.now() - 18 * 60000).toISOString() },
      { type: 'stock',    message: 'Stock adjusted for 3 products in Warehouse A', time: new Date(Date.now() - 45 * 60000).toISOString() },
      { type: 'alert',    message: 'Low stock alert: 5 items below minimum level', time: new Date(Date.now() - 90 * 60000).toISOString() },
      { type: 'user',     message: 'New customer "Tech Solutions Ltd" added', time: new Date(Date.now() - 3 * 3600000).toISOString() },
    ];
  }

  _destroy() {
    this.salesChart?.destroy();
    this.pieChart?.destroy();
    this.salesChart = null;
    this.pieChart   = null;
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }
}

window.dashboardModule = new DashboardModule();
