/**
 * API Service wrapper for Inventra Enterprise ERP
 */
class ApiService {
  constructor(baseURL = '/api/v1') {
    this.baseURL = baseURL;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    const token = localStorage.getItem('inventra_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const companyId = localStorage.getItem('inventra_company_id');
    if (companyId) {
      headers['X-Company-ID'] = companyId;
    }
    
    const branchId = localStorage.getItem('inventra_branch_id');
    if (branchId) {
      headers['X-Branch-ID'] = branchId;
    }

    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = { ...this.getHeaders(), ...options.headers };
    
    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);
      
      // Auto token refresh logic if 401 Unauthorized
      if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry request with new token
          headers['Authorization'] = `Bearer ${localStorage.getItem('inventra_token')}`;
          const retryResponse = await fetch(url, { ...config, headers });
          return this.handleResponse(retryResponse);
        } else {
          this.handleSessionExpiry();
          throw new Error('Session expired. Please log in again.');
        }
      }

      return this.handleResponse(response);
    } catch (error) {
      console.error(`API Error in ${endpoint}:`, error);
      throw error;
    }
  }

  async handleResponse(response) {
    let data;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { success: response.ok, message: await response.text() };
    }

    if (!response.ok) {
      const error = new Error(data.message || 'Something went wrong');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('inventra_refresh_token');
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (response.ok) {
        const resData = await response.json();
        if (resData.success && resData.data.token) {
          localStorage.setItem('inventra_token', resData.data.token);
          if (resData.data.refreshToken) {
            localStorage.setItem('inventra_refresh_token', resData.data.refreshToken);
          }
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Token refresh failed:', err);
      return false;
    }
  }

  handleSessionExpiry() {
    localStorage.removeItem('inventra_token');
    localStorage.removeItem('inventra_refresh_token');
    localStorage.removeItem('inventra_user');
    localStorage.removeItem('inventra_company_id');
    localStorage.removeItem('inventra_branch_id');
    
    // Only redirect if we are not already on the login page
    if (!window.location.pathname.includes('/login.html')) {
      window.location.href = '/login.html';
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: body instanceof FormData ? {} : options.headers // Let browser set boundary for multipart
    });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: body instanceof FormData ? {} : options.headers
    });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: body instanceof FormData ? {} : options.headers
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

// Global instance
window.api = new ApiService();
