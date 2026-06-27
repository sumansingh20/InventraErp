/**
 * Authentication & Session Management for Inventra Enterprise ERP
 */
class AuthManager {
  constructor() {
    this.user = null;
    this.token = null;
    this.init();
  }

  init() {
    this.token = localStorage.getItem('inventra_token');
    try {
      const userStr = localStorage.getItem('inventra_user');
      this.user = userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      console.error('Failed to parse cached user object:', e);
      this.user = null;
    }
  }

  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  setSession(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('inventra_token', token);
    localStorage.setItem('inventra_user', JSON.stringify(user));

    // Store primary company & branch if available and not already set
    if (user.companies && user.companies.length > 0) {
      const activeCompId = localStorage.getItem('inventra_company_id');
      if (!activeCompId || !user.companies.some(c => c._id === activeCompId)) {
        localStorage.setItem('inventra_company_id', user.companies[0]._id);
      }
    }
    
    // Switch or set active branch
    if (user.branches && user.branches.length > 0) {
      const activeBranchId = localStorage.getItem('inventra_branch_id');
      if (!activeBranchId || !user.branches.some(b => b._id === activeBranchId)) {
        localStorage.setItem('inventra_branch_id', user.branches[0]._id);
      }
    }
  }

  getUser() {
    return this.user;
  }

  getActiveCompanyId() {
    return localStorage.getItem('inventra_company_id');
  }

  getActiveBranchId() {
    return localStorage.getItem('inventra_branch_id');
  }

  async changeCompany(companyId) {
    localStorage.setItem('inventra_company_id', companyId);
    
    // Let's reset the branch for the new company
    try {
      const profile = await window.api.get('/auth/profile');
      if (profile.success) {
        this.setSession(this.token, profile.data.user);
        // Find branches matching company
        const companyBranches = profile.data.user.branches.filter(b => b.company === companyId);
        if (companyBranches.length > 0) {
          localStorage.setItem('inventra_branch_id', companyBranches[0]._id);
        } else {
          localStorage.removeItem('inventra_branch_id');
        }
      }
    } catch (e) {
      console.error('Failed to update company context:', e);
    }
    
    // Reload to apply changes across all components
    window.location.reload();
  }

  changeBranch(branchId) {
    localStorage.setItem('inventra_branch_id', branchId);
    window.location.reload();
  }

  async logout() {
    try {
      await window.api.post('/auth/logout', {});
    } catch (err) {
      console.warn('Backend logout failed:', err);
    } finally {
      localStorage.removeItem('inventra_token');
      localStorage.removeItem('inventra_refresh_token');
      localStorage.removeItem('inventra_user');
      localStorage.removeItem('inventra_company_id');
      localStorage.removeItem('inventra_branch_id');
      window.location.href = '/login.html';
    }
  }

  checkAuthGuard() {
    const isLoginPath = window.location.pathname.includes('/login.html');
    if (!this.isAuthenticated()) {
      if (!isLoginPath) {
        window.location.href = '/login.html';
      }
    } else {
      if (isLoginPath) {
        window.location.href = '/';
      }
    }
  }
}

// Global instance
window.auth = new AuthManager();
// Auto run check
window.auth.checkAuthGuard();
