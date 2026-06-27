/**
 * Socket.IO Real-time Connection Manager for Inventra Enterprise ERP
 */
class SocketManager {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connected = false;
  }

  connect() {
    if (this.socket) {
      this.socket.disconnect();
    }

    const token = localStorage.getItem('inventra_token');
    if (!token) return;

    // Connect to host
    this.socket = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to Inventra real-time server. ID:', this.socket.id);
      this.connected = true;
      this.updateStatusIndicator(true);
      
      // Auto re-join rooms if we were in them
      const activeWarehouseId = sessionStorage.getItem('active_warehouse_id');
      if (activeWarehouseId) {
        this.joinWarehouse(activeWarehouseId);
      }
      const activePosId = sessionStorage.getItem('active_pos_id');
      if (activePosId) {
        this.joinPos(activePosId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from real-time server. Reason:', reason);
      this.connected = false;
      this.updateStatusIndicator(false);
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      this.connected = false;
      this.updateStatusIndicator(false);
    });

    // Setup global listeners
    this.socket.on('notification:new', (data) => {
      if (window.app && typeof window.app.handleNewNotification === 'function') {
        window.app.handleNewNotification(data);
      }
    });

    this.socket.on('stock:alert', (data) => {
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast(`Low Stock Alert: ${data.productName} is at ${data.currentStock} ${data.unit}`, 'warning');
      }
    });

    this.socket.on('barcode:result', (data) => {
      this.trigger('barcode:result', data);
    });

    this.socket.on('barcode:error', (data) => {
      this.trigger('barcode:error', data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinWarehouse(warehouseId) {
    if (this.socket && this.connected) {
      this.socket.emit('join:warehouse', warehouseId);
      sessionStorage.setItem('active_warehouse_id', warehouseId);
    }
  }

  joinPos(terminalId) {
    if (this.socket && this.connected) {
      this.socket.emit('join:pos', terminalId);
      sessionStorage.setItem('active_pos_id', terminalId);
    }
  }

  scanBarcode(barcode) {
    if (this.socket && this.connected) {
      this.socket.emit('barcode:scan', { barcode });
    } else {
      console.warn('Socket not connected. Falling back to HTTP for barcode lookups.');
      window.api.get(`/pos/products?search=${encodeURIComponent(barcode)}`)
        .then(res => {
          if (res.success && res.data.products && res.data.products.length > 0) {
            this.trigger('barcode:result', {
              barcode,
              product: res.data.products[0],
              found: true
            });
          } else {
            this.trigger('barcode:result', {
              barcode,
              product: null,
              found: false
            });
          }
        })
        .catch(err => {
          this.trigger('barcode:error', { message: err.message });
        });
    }
  }

  // Register local listeners
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    
    // Also bind directly to Socket.io if not a custom wrapper event
    const systemEvents = ['barcode:result', 'barcode:error'];
    if (this.socket && !systemEvents.includes(event)) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event);
    const index = list.indexOf(callback);
    if (index !== -1) {
      list.splice(index, 1);
    }
    
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  trigger(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in event listener callback for ${event}:`, e);
        }
      });
    }
  }

  updateStatusIndicator(connected) {
    const statusDot = document.getElementById('statusDot');
    const statusContainer = document.getElementById('connectionStatus');
    if (statusDot && statusContainer) {
      if (connected) {
        statusDot.className = 'status-dot connected';
        statusContainer.title = 'Real-time connected';
      } else {
        statusDot.className = 'status-dot disconnected';
        statusContainer.title = 'Real-time disconnected (reconnecting...)';
      }
    }
  }
}

// Global instance
window.socket = new SocketManager();
// Connect if already authenticated
if (window.auth && window.auth.isAuthenticated()) {
  window.socket.connect();
}
