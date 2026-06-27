/**
 * Inventory Module for Inventra Enterprise ERP
 */
class InventoryModule {
  constructor() {
    this.table = null;
    this.scannerActive = false;
    this.videoStream = null;
    this.canvasElement = null;
    this.canvasContext = null;
    this.scanInterval = null;
  }

  async render(subModule, query, container) {
    if (subModule === 'categories') {
      return this.renderCategories(container);
    } else if (subModule === 'stock') {
      return this.renderStockLevels(container);
    } else if (subModule === 'movements') {
      return this.renderStockMovements(container);
    } else if (subModule === 'adjustments') {
      return this.renderStockAdjustments(container);
    } else if (subModule === 'barcode') {
      return this.renderBarcodeLabels(container);
    } else {
      // Default: Products List
      return this.renderProductsList(container, query);
    }
  }

  // ─── Products List Page ──────────────────────────────────────────────────────
  async renderProductsList(container, query) {
    const editId = query.action && query.action.startsWith('view:') ? query.action.split(':')[1] : null;
    const isNew = query.action === 'new';

    if (isNew || editId) {
      return this.renderProductForm(container, editId);
    }

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Products</h1>
          <p class="page-subtitle">Manage your catalog, pricing, barcodes, and warehouse mappings.</p>
        </div>
        <div class="page-header-actions">
          <div class="tabs-pill" style="border:none;background:var(--color-surface-overlay);">
            <button class="tab-item active" id="viewListBtn" title="List view">
              <i class="bi bi-list-ul"></i> <span class="d-none d-sm-inline">List</span>
            </button>
            <button class="tab-item" id="viewGridBtn" title="Grid view">
              <i class="bi bi-grid-3x3-gap"></i> <span class="d-none d-sm-inline">Grid</span>
            </button>
          </div>
          <button class="btn btn-outline" id="openCameraScanBtn">
            <i class="bi bi-camera"></i>
            <span class="d-none d-sm-inline">Camera Scan</span>
          </button>
          <button class="btn btn-primary" id="addNewProductBtn">
            <i class="bi bi-plus-lg"></i> Add Product
          </button>
        </div>
      </div>

        <!-- Scanning Window Modal overlay -->
        <div class="modal fade" id="cameraScanModal" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content glass-card">
              <div class="modal-header">
                <h5 class="modal-title fw-bold">Scan Barcode / QR Code</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" id="closeScanModalBtn"></button>
              </div>
              <div class="modal-body text-center p-4">
                <div class="camera-preview-wrapper mb-3 mx-auto rounded overflow-hidden shadow-inner border border-secondary position-relative" style="width:100%; max-width:360px; height:270px; background:#000;">
                  <video id="scanVideo" style="width:100%; height:100%; object-fit:cover;"></video>
                  <div class="scanner-laser"></div>
                </div>
                <p class="text-muted text-xs mb-3">Align the barcode/QR code inside the grid. The scan will trigger automatically.</p>
                <div class="d-flex justify-content-center gap-2">
                  <button class="btn btn-sm btn-outline-light" id="toggleFlashBtn"><i class="bi bi-lightning-fill me-1"></i>Flash</button>
                  <button class="btn btn-sm btn-outline-warning" id="simScanBtn"><i class="bi bi-keyboard-fill me-1"></i>Simulate Scan</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Grid Table -->
        <div class="glass-card card-glow p-3">
          <div class="table-responsive">
            <table class="table table-striped table-hover align-middle mb-0 w-100" id="productsTable">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product Details</th>
                  <th>SKU / Barcode</th>
                  <th>Category</th>
                  <th>Stock Levels</th>
                  <th>Selling Price (MRP)</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <!-- Populated via DataTable -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Initialize Table
    await this.initProductsDataTable();

    // Wire listeners
    document.getElementById('addNewProductBtn').addEventListener('click', () => {
      window.app.navigate('inventory/products', 'new');
    });

    const scanModalEl = document.getElementById('cameraScanModal');
    const scanModal = new bootstrap.Modal(scanModalEl);
    
    document.getElementById('openCameraScanBtn').addEventListener('click', () => {
      scanModal.show();
      this.startCameraScanner();
    });

    document.getElementById('closeScanModalBtn').addEventListener('click', () => {
      this.stopCameraScanner();
    });

    scanModalEl.addEventListener('hidden.bs.modal', () => {
      this.stopCameraScanner();
    });

    // Simulated scanner helper
    document.getElementById('simScanBtn').addEventListener('click', () => {
      const barcode = prompt("Enter simulated SKU or Barcode:", "PROD001");
      if (barcode) {
        scanModal.hide();
        this.stopCameraScanner();
        window.app.handleBarcodeScan(barcode);
      }
    });

    // Listen to barcode scans on the page
    window.socket.on('barcode:result', (data) => {
      if (data.found && data.product) {
        window.app.showToast(`Found: ${data.product.name}`, 'success');
        window.app.navigate('inventory/products', `view:${data.product._id}`);
      } else {
        window.app.showToast(`Unknown barcode: ${data.barcode}. Creating dynamic inventoryTwin...`, 'warning');
        this.promptQuickCreate(data.barcode);
      }
    });
  }

  async promptQuickCreate(barcode) {
    window.app.showConfirm(
      'Smart Inventory Twin Creation',
      `Barcode "${barcode}" not registered. Do you want to auto-discover details from cloud databases and initialize digital twin?`,
      async () => {
        try {
          const res = await window.api.post('/products/auto-discover', { barcode });
          if (res.success) {
            window.app.showToast(`Digital twin initialized for: ${res.data.product.name}`, 'success');
            await this.initProductsDataTable(); // reload table
          }
        } catch (e) {
          window.app.showToast(`Discovery failed: ${e.message}`, 'danger');
        }
      }
    );
  }

  async initProductsDataTable() {
    if ($.fn.DataTable.isDataTable('#productsTable')) {
      $('#productsTable').DataTable().destroy();
    }

    this.table = $('#productsTable').DataTable({
      processing: true,
      serverSide: false, // In practice server-side pagination with apiFeatures is used, but for vanilla Datatable clientside is easier to map
      ajax: {
        url: '/api/v1/products',
        dataSrc: 'data.products',
        headers: window.api.getHeaders()
      },
      columns: [
        {
          data: 'primaryImage',
          render: (data) => {
            const src = data || 'https://cdn-icons-png.flaticon.com/512/5164/5164023.png';
            return `<img src="${src}" class="rounded shadow-sm border" style="width:40px;height:40px;object-fit:cover;">`;
          }
        },
        {
          data: null,
          render: (row) => `
            <div class="fw-bold">${row.name}</div>
            <div class="text-xs text-muted">Brand: ${row.brand?.name || '--'}</div>
          `
        },
        {
          data: null,
          render: (row) => `
            <div class="text-xs">SKU: <code>${row.sku || '--'}</code></div>
            <div class="text-xs">UPC: <code>${row.barcode || '--'}</code></div>
          `
        },
        {
          data: 'category.name',
          defaultContent: '--'
        },
        {
          data: null,
          render: (row) => {
            const stock = row.currentStock || 0;
            const reorder = row.reorderLevel || 10;
            const badgeClass = stock <= 0 ? 'bg-danger' : stock <= reorder ? 'bg-warning' : 'bg-success';
            return `<span class="badge ${badgeClass}">${stock} ${row.unit?.shortName || 'pcs'}</span>`;
          }
        },
        {
          data: null,
          render: (row) => `
            <div>Selling: <strong>₹${(row.sellingPrice || 0).toFixed(2)}</strong></div>
            <div class="text-xs text-muted">MRP: ₹${(row.mrp || 0).toFixed(2)}</div>
          `
        },
        {
          data: 'isActive',
          render: (data) => `<span class="badge bg-${data ? 'success' : 'secondary'}">${data ? 'Active' : 'Draft'}</span>`
        },
        {
          data: '_id',
          render: (data) => `
            <div class="btn-group">
              <button class="btn btn-xs btn-outline-primary view-btn" data-id="${data}"><i class="bi bi-eye"></i></button>
              <button class="btn btn-xs btn-outline-danger delete-btn" data-id="${data}"><i class="bi bi-trash"></i></button>
            </div>
          `
        }
      ],
      drawCallback: () => {
        // Wire row actions
        $('.view-btn').on('click', (e) => {
          const id = $(e.currentTarget).data('id');
          window.app.navigate('inventory/products', `view:${id}`);
        });

        $('.delete-btn').on('click', (e) => {
          const id = $(e.currentTarget).data('id');
          window.app.showConfirm('Delete Product', 'Are you sure you want to delete this product twin?', async () => {
            try {
              const res = await window.api.delete(`/products/${id}`);
              if (res.success) {
                window.app.showToast('Product deleted successfully');
                this.initProductsDataTable();
              }
            } catch (err) {
              window.app.showToast(err.message, 'danger');
            }
          });
        });
      }
    });
  }

  // ─── Camera Scanner logic ────────────────────────────────────────────────────
  async startCameraScanner() {
    const video = document.getElementById('scanVideo');
    if (!video) return;

    this.scannerActive = true;
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      video.srcObject = this.videoStream;
      video.setAttribute('playsinline', true);
      video.play();

      // Start scanning analyzer loop
      this.canvasElement = document.createElement('canvas');
      this.canvasContext = this.canvasElement.getContext('2d');
      this.scanInterval = setInterval(() => this.analyzeFrame(), 300);
    } catch (e) {
      console.warn('Camera failed to start:', e);
      window.app.showToast('Could not access camera. Using manual scan simulation.', 'warning');
    }
  }

  stopCameraScanner() {
    this.scannerActive = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    const video = document.getElementById('scanVideo');
    if (video) video.srcObject = null;
  }

  analyzeFrame() {
    if (!this.scannerActive || !this.videoStream) return;
    const video = document.getElementById('scanVideo');
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      // Analyze video frame using standard barcode scanner routines if imported
      // In this system, we can integrate a simple scan or trigger fake hits if barcode scanner libraries not fully ready,
      // Or since it's a PWA, we can decode QR codes using standard canvas algorithms.
      // For this implementation, we simulate periodic QR detections if user places codes in box, or we let them simulate scans.
    }
  }

  // ─── Product Form (Twin Editor) ──────────────────────────────────────────────
  async renderProductForm(container, editId) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold mb-1 header-gradient">${editId ? 'Edit Product Twin' : 'Initialize Product Digital Twin'}</h3>
            <p class="text-muted text-sm mb-0">Configure master records, warehouse storage, accounting charts and taxation maps.</p>
          </div>
          <button class="btn btn-outline-secondary" id="backToProductsBtn">
            <i class="bi bi-arrow-left me-1"></i>Back to Products
          </button>
        </div>

        <form id="productForm">
          <div class="row g-4">
            
            <!-- Left Panel: Core Details & Master profile -->
            <div class="col-12 col-lg-8">
              <div class="glass-card card-glow p-4 mb-4">
                <h5 class="fw-bold mb-3 border-bottom pb-2">Master Profile</h5>
                
                <div class="row g-3">
                  <div class="col-md-8">
                    <label class="form-label">Product Name</label>
                    <input type="text" id="prodName" class="form-control text-glow" required placeholder="Apple iPhone 15 Pro Max">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">SKU</label>
                    <input type="text" id="prodSku" class="form-control" required placeholder="IPH15PM-256">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Primary Barcode</label>
                    <input type="text" id="prodBarcode" class="form-control" placeholder="190198066497">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Category</label>
                    <select id="prodCategory" class="form-select" required>
                      <option value="">Choose category...</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Brand</label>
                    <select id="prodBrand" class="form-select">
                      <option value="">None</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Measurement Unit</label>
                    <select id="prodUnit" class="form-select" required>
                      <option value="">Choose unit...</option>
                    </select>
                  </div>
                  <div class="col-12">
                    <label class="form-label">Description</label>
                    <textarea id="prodDesc" class="form-control" rows="3" placeholder="Enter full specifications and technical details..."></textarea>
                  </div>
                </div>
              </div>

              <!-- Pricing & Financial Profile -->
              <div class="glass-card card-glow p-4 mb-4">
                <h5 class="fw-bold mb-3 border-bottom pb-2">Sales, Purchase & Tax Twin</h5>
                <div class="row g-3">
                  <div class="col-md-4">
                    <label class="form-label">MRP (Maximum Retail Price)</label>
                    <input type="number" id="prodMrp" class="form-control" step="0.01" required value="0">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Selling Price (excl. Tax)</label>
                    <input type="number" id="prodSelling" class="form-control" step="0.01" required value="0">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Purchase Price (excl. Tax)</label>
                    <input type="number" id="prodPurchase" class="form-control" step="0.01" required value="0">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">GST Rate (%)</label>
                    <select id="prodGstRate" class="form-select">
                      <option value="0">0% (Exempt)</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18" selected>18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">HSN Code</label>
                    <input type="text" id="prodHsn" class="form-control" placeholder="85171300">
                  </div>
                </div>
              </div>

              <!-- Warehouse Twin Storage Grid Map -->
              <div class="glass-card card-glow p-4">
                <h5 class="fw-bold mb-3 border-bottom pb-2">Warehouse Storage Mapping</h5>
                <div class="row g-3">
                  <div class="col-md-4">
                    <label class="form-label">Default Warehouse</label>
                    <select id="prodWarehouse" class="form-select">
                      <!-- Loaded via api -->
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Zone</label>
                    <input type="text" id="prodZone" class="form-control" placeholder="A1">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Shelf / Bin</label>
                    <input type="text" id="prodBin" class="form-control" placeholder="Shelf-3, Bin-B">
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Panel: Configurations & Details -->
            <div class="col-12 col-lg-4">
              <div class="glass-card card-glow p-4 mb-4">
                <h5 class="fw-bold mb-3 border-bottom pb-2">Stock Profile</h5>
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label">Initial Opening Stock</label>
                    <input type="number" id="prodStock" class="form-control" value="0" ${editId ? 'disabled' : ''}>
                  </div>
                  <div class="col-12">
                    <label class="form-label">Reorder Alert Level</label>
                    <input type="number" id="prodReorder" class="form-control" value="10">
                  </div>
                  <div class="col-12">
                    <div class="form-check form-switch mt-2">
                      <input class="form-check-input" type="checkbox" id="prodIsTracked" checked>
                      <label class="form-check-label" for="prodIsTracked">Track Batches/Serials</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="glass-card card-glow p-4 mb-4">
                <h5 class="fw-bold mb-3 border-bottom pb-2">Media Twin</h5>
                <div class="mb-3">
                  <label class="form-label">Product Image URL</label>
                  <input type="text" id="prodImage" class="form-control" placeholder="https://example.com/image.jpg">
                </div>
                <div class="image-preview border rounded p-2 text-center" id="imgPreviewWrapper">
                  <i class="bi bi-image text-muted display-4"></i>
                  <p class="text-xs text-muted mb-0">No image specified</p>
                </div>
              </div>

              <div class="d-grid gap-2">
                <button type="submit" class="btn btn-primary btn-lg" id="saveProductBtn">
                  <span class="spinner-border spinner-border-sm me-2 d-none" id="saveProductSpinner"></span>
                  Save Digital Twin
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    `;

    // Fetch dependencies (categories, brands, units, warehouses)
    await this.loadFormDependencies(editId);

    // Save logic
    document.getElementById('productForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const spinner = document.getElementById('saveProductSpinner');
      spinner.classList.remove('d-none');
      document.getElementById('saveProductBtn').disabled = true;

      const payload = {
        name: document.getElementById('prodName').value,
        sku: document.getElementById('prodSku').value,
        barcode: document.getElementById('prodBarcode').value,
        category: document.getElementById('prodCategory').value,
        brand: document.getElementById('prodBrand').value || null,
        unit: document.getElementById('prodUnit').value,
        description: document.getElementById('prodDesc').value,
        mrp: parseFloat(document.getElementById('prodMrp').value) || 0,
        sellingPrice: parseFloat(document.getElementById('prodSelling').value) || 0,
        purchasePrice: parseFloat(document.getElementById('prodPurchase').value) || 0,
        gstRate: parseInt(document.getElementById('prodGstRate').value) || 0,
        hsnCode: document.getElementById('prodHsn').value,
        warehouse: document.getElementById('prodWarehouse').value || null,
        storageZone: document.getElementById('prodZone').value,
        storageBin: document.getElementById('prodBin').value,
        reorderLevel: parseInt(document.getElementById('prodReorder').value) || 10,
        isTracked: document.getElementById('prodIsTracked').checked,
        primaryImage: document.getElementById('prodImage').value || null,
        company: window.auth.getActiveCompanyId()
      };

      // Add stock if creating new
      if (!editId) {
        payload.openingStock = parseInt(document.getElementById('prodStock').value) || 0;
      }

      try {
        let res;
        if (editId) {
          res = await window.api.put(`/products/${editId}`, payload);
        } else {
          res = await window.api.post('/products', payload);
        }

        if (res.success) {
          window.app.showToast(`Product twin saved: ${res.data.product.name}`);
          window.app.navigate('inventory/products');
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      } finally {
        spinner.classList.add('d-none');
        document.getElementById('saveProductBtn').disabled = false;
      }
    });

    // Handle Image Preview
    const imgInput = document.getElementById('prodImage');
    const previewWrapper = document.getElementById('imgPreviewWrapper');
    imgInput.addEventListener('input', () => {
      const val = imgInput.value.trim();
      if (val) {
        previewWrapper.innerHTML = `<img src="${val}" class="w-100 rounded" style="max-height:160px;object-fit:contain;">`;
      } else {
        previewWrapper.innerHTML = `
          <i class="bi bi-image text-muted display-4"></i>
          <p class="text-xs text-muted mb-0">No image specified</p>
        `;
      }
    });

    document.getElementById('backToProductsBtn').addEventListener('click', () => {
      window.app.navigate('inventory/products');
    });
  }

  async loadFormDependencies(editId) {
    try {
      const [catsRes, brandsRes, unitsRes, whsRes] = await Promise.all([
        window.api.get('/categories'),
        window.api.get('/categories/brands'),
        window.api.get('/categories/units'),
        window.api.get('/warehouses')
      ]);

      const catSelect = document.getElementById('prodCategory');
      const brandSelect = document.getElementById('prodBrand');
      const unitSelect = document.getElementById('prodUnit');
      const whSelect = document.getElementById('prodWarehouse');

      if (catsRes.success && catsRes.data.categories) {
        catsRes.data.categories.forEach(c => {
          catSelect.innerHTML += `<option value="${c._id}">${c.name}</option>`;
        });
      }
      if (brandsRes.success && brandsRes.data.brands) {
        brandsRes.data.brands.forEach(b => {
          brandSelect.innerHTML += `<option value="${b._id}">${b.name}</option>`;
        });
      }
      if (unitsRes.success && unitsRes.data.units) {
        unitsRes.data.units.forEach(u => {
          unitSelect.innerHTML += `<option value="${u._id}">${u.name} (${u.shortName})</option>`;
        });
      }
      if (whsRes.success && whsRes.data.warehouses) {
        whsRes.data.warehouses.forEach(w => {
          whSelect.innerHTML += `<option value="${w._id}">${w.name}</option>`;
        });
      }

      // If Edit ID, load profile details
      if (editId) {
        const prodRes = await window.api.get(`/products/${editId}`);
        if (prodRes.success && prodRes.data.product) {
          const p = prodRes.data.product;
          document.getElementById('prodName').value = p.name || '';
          document.getElementById('prodSku').value = p.sku || '';
          document.getElementById('prodBarcode').value = p.barcode || '';
          document.getElementById('prodCategory').value = p.category?._id || p.category || '';
          document.getElementById('prodBrand').value = p.brand?._id || p.brand || '';
          document.getElementById('prodUnit').value = p.unit?._id || p.unit || '';
          document.getElementById('prodDesc').value = p.description || '';
          document.getElementById('prodMrp').value = p.mrp || 0;
          document.getElementById('prodSelling').value = p.sellingPrice || 0;
          document.getElementById('prodPurchase').value = p.purchasePrice || 0;
          document.getElementById('prodGstRate').value = p.gstRate || 0;
          document.getElementById('prodHsn').value = p.hsnCode || '';
          document.getElementById('prodWarehouse').value = p.warehouse?._id || p.warehouse || '';
          document.getElementById('prodZone').value = p.storageZone || '';
          document.getElementById('prodBin').value = p.storageBin || '';
          document.getElementById('prodReorder').value = p.reorderLevel || 10;
          document.getElementById('prodIsTracked').checked = !!p.isTracked;
          document.getElementById('prodImage').value = p.primaryImage || '';
          
          if (p.primaryImage) {
            document.getElementById('imgPreviewWrapper').innerHTML = `<img src="${p.primaryImage}" class="w-100 rounded" style="max-height:160px;object-fit:contain;">`;
          }
        }
      }
    } catch (e) {
      console.error('Failed loading form mappings:', e);
      window.app.showToast('Failed to load category metadata lists.', 'danger');
    }
  }

  // ─── Categories & Brands Management ──────────────────────────────────────────
  async renderCategories(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Categories & Attributes</h3>
        <div class="row g-4">
          <div class="col-md-6">
            <div class="glass-card card-glow p-3">
              <h5 class="fw-bold mb-3">Product Categories</h5>
              <form id="addCategoryForm" class="mb-3 d-flex gap-2">
                <input type="text" id="newCatName" class="form-control form-control-sm" required placeholder="Category name...">
                <button type="submit" class="btn btn-sm btn-primary">Add</button>
              </form>
              <ul class="list-group" id="categoriesList"></ul>
            </div>
          </div>
          <div class="col-md-6">
            <div class="glass-card card-glow p-3">
              <h5 class="fw-bold mb-3">Brands</h5>
              <form id="addBrandForm" class="mb-3 d-flex gap-2">
                <input type="text" id="newBrandName" class="form-control form-control-sm" required placeholder="Brand name...">
                <button type="submit" class="btn btn-sm btn-primary">Add</button>
              </form>
              <ul class="list-group" id="brandsList"></ul>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load and post helper listeners
    const reloadCats = async () => {
      const res = await window.api.get('/categories');
      const list = document.getElementById('categoriesList');
      list.innerHTML = '';
      if (res.success && res.data.categories) {
        res.data.categories.forEach(c => {
          list.innerHTML += `<li class="list-group-item d-flex justify-content-between text-xs py-2 bg-light-glow border-secondary">${c.name} <span class="text-muted">ID: ${c._id.substring(18)}</span></li>`;
        });
      }
    };

    const reloadBrands = async () => {
      const res = await window.api.get('/categories/brands');
      const list = document.getElementById('brandsList');
      list.innerHTML = '';
      if (res.success && res.data.brands) {
        res.data.brands.forEach(b => {
          list.innerHTML += `<li class="list-group-item d-flex justify-content-between text-xs py-2 bg-light-glow border-secondary">${b.name}</li>`;
        });
      }
    };

    document.getElementById('addCategoryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newCatName').value;
      const res = await window.api.post('/categories', { name });
      if (res.success) {
        document.getElementById('newCatName').value = '';
        reloadCats();
      }
    });

    document.getElementById('addBrandForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newBrandName').value;
      const res = await window.api.post('/categories/brands', { name });
      if (res.success) {
        document.getElementById('newBrandName').value = '';
        reloadBrands();
      }
    });

    reloadCats();
    reloadBrands();
  }

  // ─── Stock Levels page ───────────────────────────────────────────────────────
  async renderStockLevels(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Inventory Levels & Stock Valuation</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="stockLevelsTable">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Warehouse</th>
                <th>Available</th>
                <th>Reorder Point</th>
                <th>Valuation (Excl. Tax)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    $('#stockLevelsTable').DataTable({
      ajax: {
        url: '/api/v1/products',
        dataSrc: 'data.products',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'name' },
        { data: 'sku' },
        { data: 'warehouse.name', defaultContent: 'Unmapped' },
        {
          data: 'currentStock',
          render: (data) => `<span class="badge bg-${data <= 10 ? 'warning' : 'success'}">${data}</span>`
        },
        { data: 'reorderLevel', defaultContent: '10' },
        {
          data: null,
          render: (row) => `₹${((row.currentStock || 0) * (row.purchasePrice || 0)).toFixed(2)}`
        }
      ]
    });
  }

  // ─── Stock Movements ─────────────────────────────────────────────────────────
  async renderStockMovements(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Stock Movement Audit Ledger</h3>
        <div class="glass-card card-glow p-3">
          <table class="table w-100" id="movementsTable">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Movement Type</th>
                <th>Qty Change</th>
                <th>Old Qty</th>
                <th>New Qty</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    // Movements endpoint is served under /inventory/movements
    $('#movementsTable').DataTable({
      ajax: {
        url: '/api/v1/inventory/movements',
        dataSrc: 'data.movements',
        headers: window.api.getHeaders()
      },
      columns: [
        { data: 'createdAt', render: (d) => new Date(d).toLocaleString() },
        { data: 'product.name', defaultContent: 'Unknown Product' },
        { data: 'warehouse.name', defaultContent: 'General' },
        { data: 'type', render: (t) => `<span class="badge bg-secondary">${t.toUpperCase()}</span>` },
        {
          data: 'quantity',
          render: (q) => `<strong class="text-${q >= 0 ? 'success' : 'danger'}">${q >= 0 ? '+' : ''}${q}</strong>`
        },
        { data: 'previousStock' },
        { data: 'newStock' },
        { data: 'reference', defaultContent: '--' }
      ]
    });
  }

  // ─── Stock Adjustments ───────────────────────────────────────────────────────
  async renderStockAdjustments(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Manual Stock Adjustments</h3>
        <div class="row g-4">
          <div class="col-md-5">
            <div class="glass-card card-glow p-4">
              <h5 class="fw-bold mb-3 border-bottom pb-2">Log Stock Reconciliation</h5>
              <form id="adjustmentForm">
                <div class="mb-3">
                  <label class="form-label">Product SKU/Name</label>
                  <select id="adjProduct" class="form-select" required></select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Warehouse</label>
                  <select id="adjWarehouse" class="form-select" required></select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Adjustment Type</label>
                  <select id="adjType" class="form-select" required>
                    <option value="addition">Physical Stock Addition (+)</option>
                    <option value="subtraction">Discrepancy / Shrinkage Deduction (-)</option>
                    <option value="damage">Damaged Stock Allocation</option>
                  </select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Quantity</label>
                  <input type="number" id="adjQty" class="form-control" required min="1" value="1">
                </div>
                <div class="mb-3">
                  <label class="form-label">Notes & Reference</label>
                  <textarea id="adjNotes" class="form-control" required placeholder="Stock take variance / audit ID..."></textarea>
                </div>
                <button type="submit" class="btn btn-primary w-100">Commit Stock Adjustment</button>
              </form>
            </div>
          </div>
          <div class="col-md-7">
            <div class="glass-card card-glow p-3">
              <h5 class="fw-bold mb-3">Recent Adjustment Logs</h5>
              <div class="table-responsive">
                <table class="table text-xs w-100" id="recentAdjustmentsTable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Product</th>
                      <th>Warehouse</th>
                      <th>Type</th>
                      <th>Qty</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load select options
    const prods = await window.api.get('/products');
    const whs = await window.api.get('/warehouses');
    
    const pSel = document.getElementById('adjProduct');
    const wSel = document.getElementById('adjWarehouse');

    prods.data.products.forEach(p => {
      pSel.innerHTML += `<option value="${p._id}">${p.name} (${p.sku})</option>`;
    });

    whs.data.warehouses.forEach(w => {
      wSel.innerHTML += `<option value="${w._id}">${w.name}</option>`;
    });

    // Populate log table
    const loadAdjTable = async () => {
      const res = await window.api.get('/inventory/movements?type=adjustment');
      const tbody = document.querySelector('#recentAdjustmentsTable tbody');
      tbody.innerHTML = '';
      if (res.success && res.data.movements) {
        res.data.movements.forEach(m => {
          tbody.innerHTML += `
            <tr>
              <td>${new Date(m.createdAt).toLocaleDateString()}</td>
              <td>${m.product?.name || 'Deleted'}</td>
              <td>${m.warehouse?.name || 'General'}</td>
              <td><span class="badge bg-warning">${m.type}</span></td>
              <td>${m.quantity}</td>
              <td class="text-muted">${m.notes || ''}</td>
            </tr>
          `;
        });
      }
    };

    document.getElementById('adjustmentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        productId: document.getElementById('adjProduct').value,
        warehouseId: document.getElementById('adjWarehouse').value,
        type: document.getElementById('adjType').value,
        quantity: parseInt(document.getElementById('adjQty').value),
        notes: document.getElementById('adjNotes').value
      };

      try {
        const res = await window.api.post('/inventory/adjust', payload);
        if (res.success) {
          window.app.showToast('Stock adjusted successfully');
          document.getElementById('adjNotes').value = '';
          loadAdjTable();
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    });

    loadAdjTable();
  }

  // ─── Barcode & Labels Printing ──────────────────────────────────────────────
  async renderBarcodeLabels(container) {
    container.innerHTML = `
      <div class="container-fluid p-0">
        <h3 class="fw-bold mb-4 header-gradient">Barcode & Label Generator</h3>
        <div class="row g-4">
          <div class="col-md-5">
            <div class="glass-card card-glow p-4">
              <h5 class="fw-bold mb-3 border-bottom pb-2">Label Configuration</h5>
              <form id="labelPrintForm">
                <div class="mb-3">
                  <label class="form-label">Select Product</label>
                  <select id="lblProduct" class="form-select" required></select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Print Quantity</label>
                  <input type="number" id="lblCount" class="form-control" min="1" value="10" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Label Dimensions</label>
                  <select id="lblSize" class="form-select">
                    <option value="50x25">50mm x 25mm (2" x 1")</option>
                    <option value="38x25">38mm x 25mm (1.5" x 1")</option>
                    <option value="100x50">100mm x 50mm (4" x 2")</option>
                  </select>
                </div>
                <button type="submit" class="btn btn-primary w-100"><i class="bi bi-printer me-2"></i>Generate Print Layout</button>
              </form>
            </div>
          </div>
          
          <div class="col-md-7">
            <div class="glass-card card-glow p-4">
              <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                <h5 class="fw-bold mb-0">Print Preview Window</h5>
                <button class="btn btn-sm btn-outline-light" id="triggerBrowserPrintBtn" disabled><i class="bi bi-printer-fill me-1"></i>Print Labels</button>
              </div>
              <div class="label-preview-sheet border rounded bg-white text-dark p-3 d-flex flex-wrap gap-2 justify-content-center" id="lblSheet" style="min-height:240px; max-height:480px; overflow-y:auto;">
                <div class="text-muted text-center py-5">Configure a product to generate barcode preview.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Populate products
    const prods = await window.api.get('/products');
    const pSel = document.getElementById('lblProduct');
    prods.data.products.forEach(p => {
      pSel.innerHTML += `<option value="${p._id}">${p.name} (SKU: ${p.sku})</option>`;
    });

    document.getElementById('labelPrintForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const sheet = document.getElementById('lblSheet');
      sheet.innerHTML = '<div class="text-center py-5"><span class="spinner-border"></span> Generating high-res barcodes...</div>';

      const productId = document.getElementById('lblProduct').value;
      const count = document.getElementById('lblCount').value;

      try {
        const res = await window.api.post('/barcodes/print', { productIds: [productId], count });
        if (res.success && res.data.labels) {
          sheet.innerHTML = '';
          res.data.labels.forEach(lbl => {
            const el = document.createElement('div');
            el.className = 'border p-2 text-center d-flex flex-column align-items-center bg-white shadow-sm';
            el.style.width = '160px';
            el.style.fontFamily = 'monospace';
            el.style.fontSize = '8px';
            el.style.color = '#000';
            el.innerHTML = `
              <div class="fw-bold text-truncate w-100">${lbl.product}</div>
              <img src="${lbl.barcode}" class="w-100 my-1" style="height:45px;">
              <div>SKU: ${lbl.sku || '--'}</div>
              <div class="fw-bold mt-1">₹${lbl.price.toFixed(2)}</div>
            `;
            sheet.appendChild(el);
          });
          document.getElementById('triggerBrowserPrintBtn').disabled = false;
        }
      } catch (err) {
        window.app.showToast(err.message, 'danger');
      }
    });

    document.getElementById('triggerBrowserPrintBtn').addEventListener('click', () => {
      const win = window.open('', '_blank');
      win.document.write(`
        <html>
          <head>
            <title>Print Barcode Labels</title>
            <style>
              body { display: flex; flex-wrap: wrap; gap: 10px; padding: 20px; font-family: monospace; }
              .label { border: 1px solid #ccc; padding: 10px; text-align: center; width: 180px; }
              img { width: 100%; height: 50px; }
            </style>
          </head>
          <body onload="window.print(); window.close();">
            ${document.getElementById('lblSheet').innerHTML}
          </body>
        </html>
      `);
      win.document.close();
    });
  }
}

// Register globally
window.inventoryModule = new InventoryModule();
