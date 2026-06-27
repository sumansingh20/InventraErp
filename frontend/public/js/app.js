/**
 * Inventra Enterprise ERP — Main App Controller
 * Premium app shell: router, toast system, command palette,
 * sidebar collapse, theme switcher, barcode scanner, notifications
 * Version: 3.0.0
 */
class AppController {
  constructor() {
    this.currentRoute = '';
    this.modules = {};
    this.toastContainer = null;
    this.confirmModal = null;
    this.confirmCallback = null;
    this.notifications = [];
    this._commandItems = [];
    this._commandSelectedIndex = -1;
    this._commandOpen = false;
  }

  async init() {
    this.toastContainer = document.getElementById('toastContainer');

    // ── Bootstrap Modal ──────────────────────────────────────────
    const modalEl = document.getElementById('confirmModal');
    if (modalEl) {
      this.confirmModal = new bootstrap.Modal(modalEl);
      const confirmBtn = document.getElementById('confirmModalBtn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          if (this.confirmCallback) {
            this.confirmCallback();
            this.confirmCallback = null;
          }
          this.confirmModal.hide();
        });
      }
    }

    // ── Restore theme ────────────────────────────────────────────
    const savedTheme = localStorage.getItem('inventra_theme') || 'dark';
    this._applyTheme(savedTheme);

    // ── Restore sidebar state ────────────────────────────────────
    const sidebarCollapsed = localStorage.getItem('inventra_sidebar_collapsed') === 'true';
    if (sidebarCollapsed) {
      document.getElementById('sidebar')?.classList.add('collapsed');
    }

    // ── Update user / company UI ─────────────────────────────────
    this.updateUserUI();

    // ── Wire event listeners ─────────────────────────────────────
    this.setupListeners();

    // ── Command palette items ────────────────────────────────────
    this._buildCommandItems();

    // ── Initial route ────────────────────────────────────────────
    this.handleRouting();

    // ── Load notifications ───────────────────────────────────────
    this.loadNotifications();

    // ── Dismiss loader ───────────────────────────────────────────
    this._dismissLoader();
  }

  /* ── Loader ────────────────────────────────────────────────── */
  _dismissLoader() {
    const loader = document.getElementById('appLoader');
    const app    = document.getElementById('app');
    const step   = document.getElementById('lStep1');

    if (step) {
      step.textContent = '✓ Ready';
      step.classList.add('done');
    }

    setTimeout(() => {
      loader?.classList.add('fade-out');
      if (app) app.style.display = 'flex';
      document.body.classList.remove('app-loading');
      setTimeout(() => loader?.remove(), 600);
    }, 600);
  }

  /* ── Theme ─────────────────────────────────────────────────── */
  _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) {
      icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
    }
    // Update Chart.js defaults if loaded
    if (window.Chart) {
      const textColor   = theme === 'dark' ? 'rgba(148,163,184,0.9)' : '#64748b';
      const gridColor   = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      Chart.defaults.color = textColor;
      Chart.defaults.borderColor = gridColor;
    }
  }

  /* ── User / Company UI ─────────────────────────────────────── */
  updateUserUI() {
    const user = window.auth.getUser();
    if (!user) return;

    const nameEl   = document.getElementById('userNameText');
    const roleEl   = document.getElementById('userRoleText');
    const avatarEl = document.getElementById('userAvatarEl');

    if (nameEl)   nameEl.textContent  = user.name || 'User';
    if (roleEl)   roleEl.textContent  = user.role?.name || (user.isSuperAdmin ? 'Platform Owner' : 'Staff');
    if (avatarEl) avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();

    // Company
    const activeCompanyId = window.auth.getActiveCompanyId();
    const activeCompany   = user.companies?.find(c => c._id === activeCompanyId);
    if (activeCompany) {
      const nameT  = document.getElementById('companyNameText');
      const planT  = document.getElementById('companyPlanBadge');
      const logoEl = document.getElementById('companyLogo');

      if (nameT)  nameT.textContent  = activeCompany.name;
      if (planT)  planT.textContent  = activeCompany.plan || 'Standard';
      if (logoEl) logoEl.textContent = activeCompany.name.charAt(0).toUpperCase();
    }
  }

  /* ── Event Listeners ───────────────────────────────────────── */
  setupListeners() {
    // ── Route clicks ──────────────────────────────────────────
    document.addEventListener('click', e => {
      const link = e.target.closest('[data-route]');
      if (link) {
        e.preventDefault();
        const route  = link.getAttribute('data-route');
        const action = link.getAttribute('data-action');
        this.navigate(route, action);
        // Close mobile sidebar
        document.getElementById('sidebar')?.classList.remove('mobile-open');
        document.getElementById('sidebarOverlay')?.classList.remove('show');
      }
    });

    // ── Hash change ──────────────────────────────────────────
    window.addEventListener('hashchange', () => this.handleRouting());

    // ── Sidebar collapse ─────────────────────────────────────
    document.getElementById('sidebarCollapseBtn')?.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      sidebar?.classList.toggle('collapsed');
      const isCollapsed = sidebar?.classList.contains('collapsed');
      localStorage.setItem('inventra_sidebar_collapsed', isCollapsed);
      // Flip the icon
      const btn = document.getElementById('sidebarCollapseBtn');
      const icon = btn?.querySelector('i');
      if (icon) icon.className = isCollapsed ? 'bi bi-layout-sidebar' : 'bi bi-layout-sidebar-reverse';
    });

    // ── Mobile sidebar ───────────────────────────────────────
    const mobileToggle  = document.getElementById('mobileSidebarToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar        = document.getElementById('sidebar');

    mobileToggle?.addEventListener('click', () => {
      sidebar?.classList.toggle('mobile-open');
      sidebarOverlay?.classList.toggle('show');
    });

    sidebarOverlay?.addEventListener('click', () => {
      sidebar?.classList.remove('mobile-open');
      sidebarOverlay.classList.remove('show');
    });

    // ── Theme toggle ─────────────────────────────────────────
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next    = current === 'dark' ? 'light' : 'dark';
      this._applyTheme(next);
      localStorage.setItem('inventra_theme', next);
      this.showToast(`Switched to ${next === 'dark' ? '🌙 Dark' : '☀️ Light'} mode`, 'info');
    });

    // ── Logout ───────────────────────────────────────────────
    document.getElementById('logoutBtn')?.addEventListener('click', e => {
      e.preventDefault();
      this.showConfirm(
        'Sign Out',
        'Are you sure you want to end your session?',
        () => window.auth.logout(),
        'danger'
      );
    });

    // ── Mark all notifications read ──────────────────────────
    document.getElementById('markAllReadBtn')?.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await window.api.patch('/notifications/read-all', {});
        this.loadNotifications();
        this.showToast('All notifications marked as read', 'success');
      } catch (err) { console.error(err); }
    });

    // ── Sub-nav toggles ──────────────────────────────────────
    document.getElementById('navFinReportsToggle')?.addEventListener('click', () => {
      const sub = document.getElementById('navFinReportsSub');
      const btn = document.getElementById('navFinReportsToggle');
      sub?.classList.toggle('open');
      btn?.classList.toggle('open');
    });

    // ── Company switcher ─────────────────────────────────────
    document.getElementById('companySwitcherBtn')?.addEventListener('click', () => {
      this._renderCompanySwitcherDropdown();
    });

    // ── Command palette (Ctrl+K / /) ─────────────────────────
    document.getElementById('searchTrigger')?.addEventListener('click', () => this.openCommandPalette());

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.openCommandPalette();
      }
      if (e.key === 'Escape' && this._commandOpen) {
        this.closeCommandPalette();
      }
    });

    // Command palette input
    document.getElementById('commandInput')?.addEventListener('input', e => {
      this._filterCommandItems(e.target.value);
    });

    document.getElementById('commandInput')?.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this._moveCommandSelection(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this._moveCommandSelection(-1); }
      if (e.key === 'Enter')     { e.preventDefault(); this._executeCommandSelection(); }
    });

    document.getElementById('commandPaletteBackdrop')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeCommandPalette();
    });

    // ── Hardware barcode scanner ─────────────────────────────
    this.setupHardwareBarcodeScanner();

    // ── Mobile FAB ───────────────────────────────────────────
    document.getElementById('mobileFAB')?.addEventListener('click', () => {
      this.openCommandPalette();
    });
  }

  /* ── Company Switcher Dropdown ─────────────────────────────── */
  _renderCompanySwitcherDropdown() {
    const user = window.auth.getUser();
    const activeCompanyId = window.auth.getActiveCompanyId();

    const existing = document.getElementById('companySwitcherMenu');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.id = 'companySwitcherMenu';
    menu.className = 'dropdown-menu show';
    menu.style.cssText = `
      position:absolute; top:100%; left:8px; right:8px;
      z-index:${getComputedStyle(document.documentElement).getPropertyValue('--z-dropdown')};
      border-radius:var(--radius-xl); border:1px solid var(--color-border);
      background:var(--card-bg); box-shadow:var(--shadow-5); padding:6px;
    `;

    const label = document.createElement('div');
    label.className = 'dropdown-label';
    label.textContent = 'Switch Organization';
    menu.appendChild(label);

    if (user.companies?.length) {
      user.companies.forEach(company => {
        const item = document.createElement('button');
        item.className = 'dropdown-item';
        item.innerHTML = `
          <span class="avatar avatar-sm avatar-square" style="background:linear-gradient(135deg,var(--indigo-600),var(--violet-600));font-size:11px;">
            ${company.name.charAt(0).toUpperCase()}
          </span>
          <span style="flex:1;">${company.name}</span>
          ${company._id === activeCompanyId ? '<i class="bi bi-check-circle-fill" style="color:var(--color-primary);"></i>' : ''}
        `;
        item.style.gap = '10px';
        item.addEventListener('click', () => {
          if (company._id !== activeCompanyId) {
            window.auth.changeCompany(company._id);
          }
          menu.remove();
        });
        menu.appendChild(item);
      });
    }

    const div = document.createElement('div');
    div.className = 'dropdown-divider';
    menu.appendChild(div);

    const addBtn = document.createElement('button');
    addBtn.className = 'dropdown-item';
    addBtn.innerHTML = '<i class="bi bi-plus-circle"></i> <span>New Organization</span>';
    addBtn.style.gap = '10px';
    addBtn.style.color = 'var(--color-primary)';
    addBtn.addEventListener('click', () => {
      this.showToast('Contact system administrator to allocate tenant slots.', 'info');
      menu.remove();
    });
    menu.appendChild(addBtn);

    const companySwitcher = document.getElementById('companySwitcherBtn').parentElement;
    companySwitcher.style.position = 'relative';
    companySwitcher.appendChild(menu);

    const close = e => {
      if (!menu.contains(e.target) && !document.getElementById('companySwitcherBtn').contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 10);
  }

  /* ── Command Palette ───────────────────────────────────────── */
  _buildCommandItems() {
    this._commandItems = [
      // Navigation
      { icon: 'bi-speedometer2', label: 'Dashboard', route: 'dashboard', group: 'Navigate', kbd: 'G D' },
      { icon: 'bi-box-seam', label: 'Products', route: 'inventory/products', group: 'Navigate' },
      { icon: 'bi-display', label: 'POS Terminal', route: 'pos/terminal', group: 'Navigate', kbd: 'G P' },
      { icon: 'bi-file-earmark-text', label: 'Invoices', route: 'sales/invoices', group: 'Navigate' },
      { icon: 'bi-cart-plus', label: 'Purchase Orders', route: 'purchase/orders', group: 'Navigate' },
      { icon: 'bi-book', label: 'Ledger', route: 'accounting/ledger', group: 'Navigate' },
      { icon: 'bi-funnel', label: 'Leads', route: 'crm/leads', group: 'Navigate' },
      { icon: 'bi-person-badge', label: 'Employees', route: 'hrms/employees', group: 'Navigate' },
      { icon: 'bi-gear-wide-connected', label: 'Work Orders', route: 'manufacturing/work-orders', group: 'Navigate' },
      { icon: 'bi-graph-up-arrow', label: 'Sales Reports', route: 'reports/sales', group: 'Navigate' },
      { icon: 'bi-people-fill', label: 'Users & Roles', route: 'admin/users', group: 'Navigate' },
      // Actions
      { icon: 'bi-file-earmark-plus', label: 'New Invoice', route: 'sales/invoices', action: 'new', group: 'Create', accentColor: 'var(--color-success)' },
      { icon: 'bi-cart-plus', label: 'New Purchase Order', route: 'purchase/orders', action: 'new', group: 'Create', accentColor: 'var(--color-success)' },
      { icon: 'bi-person-plus', label: 'Add Customer', route: 'sales/customers', action: 'new', group: 'Create', accentColor: 'var(--color-success)' },
      { icon: 'bi-box-seam', label: 'Add Product', route: 'inventory/products', action: 'new', group: 'Create', accentColor: 'var(--color-success)' },
      { icon: 'bi-people', label: 'Add Supplier', route: 'purchase/suppliers', action: 'new', group: 'Create', accentColor: 'var(--color-success)' },
    ];
  }

  openCommandPalette() {
    const palette = document.getElementById('commandPalette');
    if (!palette) return;
    palette.style.display = 'block';
    this._commandOpen = true;
    this._commandSelectedIndex = -1;
    this._filterCommandItems('');

    const input = document.getElementById('commandInput');
    if (input) { input.value = ''; input.focus(); }
  }

  closeCommandPalette() {
    const palette = document.getElementById('commandPalette');
    if (palette) palette.style.display = 'none';
    this._commandOpen = false;
  }

  _filterCommandItems(query) {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? this._commandItems.filter(item =>
          item.label.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q)
        )
      : this._commandItems;

    const results = document.getElementById('commandResults');
    if (!results) return;

    if (filtered.length === 0) {
      results.innerHTML = `
        <div class="empty-state" style="padding:32px 16px;">
          <div class="empty-icon" style="width:48px;height:48px;font-size:22px;margin-bottom:12px;">
            <i class="bi bi-search"></i>
          </div>
          <div class="empty-title" style="font-size:14px;">No results for "${query}"</div>
        </div>
      `;
      return;
    }

    // Group items
    const groups = {};
    filtered.forEach(item => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });

    results.innerHTML = '';
    let globalIndex = 0;

    Object.entries(groups).forEach(([groupName, items]) => {
      const label = document.createElement('div');
      label.className = 'command-group-label';
      label.textContent = groupName;
      results.appendChild(label);

      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'command-item';
        el.dataset.index = globalIndex;
        el.innerHTML = `
          <div class="command-item-icon" style="${item.accentColor ? `background:${item.accentColor}22;color:${item.accentColor};` : ''}">
            <i class="bi ${item.icon}"></i>
          </div>
          <span class="command-item-label">${item.label}</span>
          ${item.kbd ? `<span class="command-item-shortcut">${item.kbd}</span>` : ''}
        `;
        el.addEventListener('click', () => {
          this.navigate(item.route, item.action || null);
          this.closeCommandPalette();
        });
        results.appendChild(el);
        globalIndex++;
      });
    });

    this._commandSelectedIndex = -1;
  }

  _moveCommandSelection(delta) {
    const items = document.querySelectorAll('#commandResults .command-item');
    if (!items.length) return;
    items[this._commandSelectedIndex]?.classList.remove('selected');
    this._commandSelectedIndex = Math.max(0, Math.min(items.length - 1, this._commandSelectedIndex + delta));
    const selected = items[this._commandSelectedIndex];
    selected?.classList.add('selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  _executeCommandSelection() {
    const items = document.querySelectorAll('#commandResults .command-item');
    const selected = this._commandSelectedIndex >= 0
      ? items[this._commandSelectedIndex]
      : items[0];
    selected?.click();
  }

  /* ── Hardware Barcode Scanner ──────────────────────────────── */
  setupHardwareBarcodeScanner() {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    document.addEventListener('keypress', e => {
      const active = document.activeElement;
      const isInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT';

      const now = Date.now();
      if (now - lastKeyTime > 50) barcodeBuffer = '';
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 3 && !isInput) {
          e.preventDefault();
          this.handleBarcodeScan(barcodeBuffer);
          barcodeBuffer = '';
        }
      } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
      }
    });
  }

  handleBarcodeScan(barcode) {
    this.showToast(`Barcode scanned: ${barcode}`, 'info', '📷 Scanner');
    window.socket?.scanBarcode(barcode);
  }

  /* ── Navigation ────────────────────────────────────────────── */
  navigate(route, action = null) {
    const hash = action ? `${route}?action=${action}` : route;
    window.location.hash = hash;
  }

  handleRouting() {
    const fullHash  = window.location.hash.substring(1) || 'dashboard';
    const [route, queryStr = ''] = fullHash.split('?');

    const query = {};
    if (queryStr) {
      queryStr.split('&').forEach(param => {
        const [k, v] = param.split('=');
        if (k) query[k] = decodeURIComponent(v || '');
      });
    }

    this.currentRoute = route;
    this.updateSidebarActive(route);
    this.updateBreadcrumbs(route);

    // Close mobile sidebar
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebarOverlay')?.classList.remove('show');

    // Update mobile bottom nav
    this._updateMobileNav(route);

    this.renderRouteView(route, query);
  }

  updateSidebarActive(route) {
    document.querySelectorAll('#sidebarNav .nav-item, #sidebarNav .nav-sub-item').forEach(el => {
      el.classList.remove('active');
      el.removeAttribute('aria-current');
      const itemRoute = el.getAttribute('data-route');
      if (itemRoute && (route === itemRoute || route.startsWith(itemRoute + '/'))) {
        el.classList.add('active');
        el.setAttribute('aria-current', 'page');

        // Open parent subnav
        const subnav = el.closest('.nav-sub');
        if (subnav) {
          subnav.classList.add('open');
          const toggle = subnav.previousElementSibling;
          if (toggle) toggle.classList.add('open');
        }
      }
    });
  }

  _updateMobileNav(route) {
    document.querySelectorAll('.mobile-nav-item[data-route]').forEach(el => {
      el.classList.remove('active');
      if (route.startsWith(el.getAttribute('data-route'))) {
        el.classList.add('active');
      }
    });
  }

  updateBreadcrumbs(route) {
    const list = document.getElementById('breadcrumbList');
    if (!list) return;

    list.innerHTML = '<li class="breadcrumb-item"><a href="#" data-route="dashboard">Home</a><span class="breadcrumb-separator"><i class="bi bi-chevron-right"></i></span></li>';

    const parts = route.split('/');
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const title  = part.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const li     = document.createElement('li');
      li.className = `breadcrumb-item${isLast ? ' active' : ''}`;

      if (isLast) {
        li.textContent = title;
      } else {
        const subRoute = parts.slice(0, i + 1).join('/');
        li.innerHTML = `<a href="#" data-route="${subRoute}">${title}</a><span class="breadcrumb-separator"><i class="bi bi-chevron-right"></i></span>`;
      }
      list.appendChild(li);
    });
  }

  /* ── Route Rendering ───────────────────────────────────────── */
  async renderRouteView(route, query) {
    const mainEl = document.getElementById('pageContent');
    if (!mainEl) return;

    // Show skeleton while loading
    mainEl.innerHTML = this._skeletonLoader();

    const [mainModule, subModule = ''] = route.split('/');
    const moduleName   = `${mainModule}Module`;
    const targetModule = window[moduleName];

    if (targetModule && typeof targetModule.render === 'function') {
      try {
        await targetModule.render(subModule, query, mainEl);
        // Trigger page entry animation
        mainEl.querySelectorAll(':scope > *').forEach((el, i) => {
          el.style.animation = `pageEnter 0.3s ease ${i * 30}ms both`;
        });
      } catch (err) {
        console.error(`Failed to render ${route}:`, err);
        mainEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon" style="background:var(--color-danger-subtle);color:var(--color-danger);">
              <i class="bi bi-exclamation-triangle-fill"></i>
            </div>
            <div class="empty-title">Page Error</div>
            <div class="empty-description">An error occurred while loading <strong>${route}</strong>.<br>${err.message}</div>
            <button class="btn btn-soft-danger" onclick="window.location.reload()">
              <i class="bi bi-arrow-clockwise"></i> Reload App
            </button>
          </div>
        `;
      }
    } else {
      mainEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <i class="bi bi-cone-striped"></i>
          </div>
          <div class="empty-title">Coming Soon</div>
          <div class="empty-description">The module <strong>${route}</strong> is being built or is unavailable in this edition.</div>
          <a href="#" data-route="dashboard" class="btn btn-soft-primary">
            <i class="bi bi-arrow-left"></i> Back to Dashboard
          </a>
        </div>
      `;
    }
  }

  _skeletonLoader() {
    return `
      <div style="animation:pageEnter 0.2s ease both;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:16px;">
          <div>
            <div class="skeleton" style="width:220px;height:32px;border-radius:8px;margin-bottom:8px;"></div>
            <div class="skeleton" style="width:140px;height:16px;border-radius:6px;"></div>
          </div>
          <div class="skeleton" style="width:120px;height:38px;border-radius:12px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
          ${[1,2,3,4].map(() => `<div class="skeleton" style="height:120px;border-radius:16px;"></div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;">
          <div class="skeleton" style="height:280px;border-radius:16px;"></div>
          <div class="skeleton" style="height:280px;border-radius:16px;"></div>
        </div>
      </div>
    `;
  }

  /* ── Notifications ─────────────────────────────────────────── */
  async loadNotifications() {
    try {
      const res = await window.api.get('/notifications');
      if (res.success) {
        this.notifications = res.data.notifications || [];
        this._renderNotifications(res.data.unreadCount || 0);
      }
    } catch (e) { console.warn('Notifications unavailable:', e); }
  }

  _renderNotifications(unreadCount) {
    const countEl = document.getElementById('notifCount');
    if (countEl) {
      countEl.textContent = unreadCount;
      countEl.style.display = unreadCount > 0 ? 'flex' : 'none';
    }

    const list = document.getElementById('notifList');
    if (!list) return;

    if (!this.notifications.length) {
      list.innerHTML = `
        <div class="notif-empty">
          <i class="bi bi-bell-slash" style="font-size:32px;opacity:0.25;"></i>
          <span>No notifications yet</span>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    this.notifications.slice(0, 12).forEach(n => {
      const userId   = window.auth.getUser()?._id;
      const rec      = n.recipients?.find(r => r.user === userId);
      const isUnread = rec ? !rec.isRead : false;

      const iconMap = {
        low_stock: 'bi-exclamation-triangle-fill',
        payment:   'bi-cash-stack',
        overdue:   'bi-calendar-x-fill',
        system:    'bi-gear-fill',
        order:     'bi-bag-check-fill',
      };
      const icon = iconMap[n.type] || 'bi-bell-fill';
      const typeClass = n.type || 'system';

      const item = document.createElement('div');
      item.className = `notif-item${isUnread ? ' unread' : ''}`;
      item.innerHTML = `
        <div class="notif-item-icon ${typeClass}"><i class="bi ${icon}"></i></div>
        <div class="notif-item-body">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-message">${n.message}</div>
          <div class="notif-item-time">${this.formatRelativeTime(n.createdAt)}</div>
        </div>
        ${isUnread ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--color-primary);flex-shrink:0;margin-top:6px;"></div>' : ''}
      `;

      if (isUnread) {
        item.addEventListener('click', async () => {
          try {
            await window.api.patch(`/notifications/${n._id}/read`, {});
            this.loadNotifications();
          } catch (err) { console.error(err); }
        });
      }
      list.appendChild(item);
    });

    document.getElementById('markAllReadBtn')?.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await window.api.patch('/notifications/read-all', {});
        this.loadNotifications();
      } catch (err) { console.error(err); }
    });
  }

  handleNewNotification(n) {
    this.notifications.unshift(n);
    const unread = this.notifications.filter(notif => {
      const rec = notif.recipients?.find(r => r.user === window.auth.getUser()?._id);
      return rec ? !rec.isRead : false;
    }).length;
    this._renderNotifications(unread);
    this.showToast(n.message, 'info', n.title);
  }

  formatRelativeTime(dateStr) {
    const d    = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const sec  = Math.floor(diff / 1000);
    if (sec < 60)  return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60)  return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    if (hrs < 48)  return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  /* ── Toast Notifications ───────────────────────────────────── */
  showToast(message, type = 'success', title = null, duration = 5000) {
    if (!this.toastContainer) return;

    const icons = {
      success: 'bi-check-circle-fill',
      danger:  'bi-exclamation-octagon-fill',
      error:   'bi-exclamation-octagon-fill',
      warning: 'bi-exclamation-triangle-fill',
      info:    'bi-info-circle-fill',
      default: 'bi-bell-fill',
    };

    const typeKey = type === 'error' ? 'danger' : type;
    const icon    = icons[typeKey] || icons.default;

    const defaultTitles = {
      success: 'Success',
      danger:  'Error',
      error:   'Error',
      warning: 'Warning',
      info:    'Notice',
    };

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${typeKey}`;
    toastEl.innerHTML = `
      <div class="toast-icon"><i class="bi ${icon}"></i></div>
      <div class="toast-content">
        <div class="toast-title">${title || defaultTitles[typeKey] || 'Notification'}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <i class="bi bi-x-lg"></i>
      </button>
      <div class="toast-progress" style="animation-duration:${duration}ms;"></div>
    `;

    const closeBtn = toastEl.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => this._dismissToast(toastEl));

    this.toastContainer.appendChild(toastEl);

    // Auto-dismiss
    setTimeout(() => this._dismissToast(toastEl), duration);
  }

  _dismissToast(toastEl) {
    toastEl.classList.add('hiding');
    setTimeout(() => toastEl.remove(), 350);
  }

  /* ── Confirm Dialog ────────────────────────────────────────── */
  showConfirm(title, body, onConfirm, type = 'danger') {
    const titleEl = document.getElementById('confirmModalTitle');
    const bodyEl  = document.getElementById('confirmModalBody');
    const btnEl   = document.getElementById('confirmModalBtn');

    if (titleEl && bodyEl && this.confirmModal) {
      titleEl.textContent = title;
      bodyEl.innerHTML    = `<p class="text-secondary" style="margin:0;font-size:14px;">${body}</p>`;
      if (btnEl) {
        btnEl.className = `btn btn-${type}`;
        btnEl.textContent = type === 'danger' ? 'Confirm Delete' : 'Confirm';
      }
      this.confirmCallback = onConfirm;
      this.confirmModal.show();
    } else {
      if (confirm(`${title}\n\n${body}`)) onConfirm();
    }
  }

  /* ── Connection status ──────────────────────────────────────── */
  setConnectionStatus(status) {
    const dot = document.getElementById('connectionDot');
    if (!dot) return;
    dot.className = `connection-dot ${status}`;
    const titles = {
      connected:    'Live — Real-time connected',
      connecting:   'Connecting...',
      disconnected: 'Offline',
      error:        'Connection error',
    };
    dot.title = titles[status] || status;
  }

  /* ── Low Stock badge ─────────────────────────────────────────── */
  updateLowStockBadge(count) {
    const badge = document.getElementById('lowStockBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
}

/* ── Bootstrap ─────────────────────────────────────────────────── */
window.app = new AppController();

$(document).ready(() => {
  if (window.auth.isAuthenticated()) {
    window.app.init();
  } else {
    window.location.href = '/login.html';
  }
});
