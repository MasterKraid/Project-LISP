import { User, Branch, PackageList, Package, Lab, Customer, Receipt, Estimate, Document, FormattedCustomer, Transaction, LabReport, MasterPackage, AdminSettings } from '../types';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper for all API calls to the backend
async function apiFetch(url: string, options: RequestInit = {}) {
  // Default headers, can be overridden
  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = getCookie('XSRF-TOKEN');
    if (csrfToken) {
      options.headers = {
        ...options.headers,
        'X-XSRF-TOKEN': csrfToken
      };
    }
  }

  // NEW: Add Acting As header if present in session
  const actingAs = sessionStorage.getItem('actingAsClient');
  if (actingAs) {
    try {
      const client = JSON.parse(actingAs);
      if (client && client.id) {
        options.headers = {
          ...options.headers,
          'X-Acting-As-Client-Id': client.id.toString()
        };
      }
    } catch (e) {
      console.warn("Failed to parse actingAsClient from session", e);
    }
  }

  const response = await fetch(`/api${url}`, options); // Prepends /api to use the Vite proxy

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      // Try to parse a JSON error message from the backend
      const errorBody = await response.json();
      errorMessage = errorBody.message || errorMessage;
    } catch (e) {
      // Response was not JSON or failed to parse
    }
    throw new Error(errorMessage);
  }

  // Handle responses that have no body (e.g., 204 No Content for DELETE/PUT)
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const apiService = {
  // --- Auth ---
  login: async (username: string, password: string): Promise<{ user: User; branch: Branch }> => {
    const hashedPassword = await sha256(password);
    return apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, password_hash: hashedPassword }),
    });
  },

  getCurrentUser: (): Promise<{ user: User; branch: Branch }> => {
    return apiFetch('/auth/me');
  },

  logout: (): Promise<void> => {
    return apiFetch('/auth/logout', { method: 'POST' });
  },

  // --- Document Creation ---
  createReceipt: (payload: any, user: User, branch: Branch, acting_as_client_id?: number): Promise<{ newReceipt: Receipt; updatedUser: User | null }> => {
    return apiFetch('/receipts', {
      method: 'POST',
      body: JSON.stringify({ payload, context: { user, branch, acting_as_client_id } }),
    });
  },

  updateReceipt: (id: number, payload: any): Promise<void> => {
    return apiFetch(`/receipts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ payload }),
    });
  },

  createEstimate: (payload: any, user: User, branch: Branch): Promise<Estimate> => {
    return apiFetch('/estimates', {
      method: 'POST',
      body: JSON.stringify({ payload, context: { user, branch } }),
    });
  },

  // --- Data Viewing ---
  getReceiptById: (id: number): Promise<{ receipt: Receipt; customer: Customer; items: any[]; branch: Branch }> => apiFetch(`/receipts/${id}`),
  getEstimateById: (id: number): Promise<{ estimate: Estimate; customer: Customer; items: any[]; branch: Branch }> => apiFetch(`/estimates/${id}`),
  searchCustomers: (query: string): Promise<Customer[]> => apiFetch(`/customers/search?q=${encodeURIComponent(query)}`),
  getPackageListsForLab: (labId: number): Promise<PackageList[]> => apiFetch(`/package-lists/for-lab/${labId}`),
  getPackagesForList: (listId: number): Promise<Package[]> => apiFetch(`/packages/for-list/${listId}`),
  getTransactionsForUser: (): Promise<Transaction[]> => apiFetch('/transactions'),


  // --- Admin: Data Fetching ---
  getUsers: (): Promise<User[]> => apiFetch('/users'),
  getUserById: (id: number): Promise<User> => apiFetch(`/users/${id}`),
  getBranches: (): Promise<Branch[]> => apiFetch('/branches'),
  getLabs: (): Promise<Lab[]> => apiFetch('/labs'),
  getPackageLists: (): Promise<PackageList[]> => apiFetch('/package-lists'),
  getClientWallets: (query?: string): Promise<User[]> => apiFetch(`/client-wallets?q=${encodeURIComponent(query || '')}`),
  getAllCustomers: (): Promise<FormattedCustomer[]> => apiFetch('/customers'),
  getCustomerById: (id: number): Promise<Customer> => apiFetch(`/customers/${id}`),
  getReceipts: (): Promise<Document[]> => apiFetch('/receipts'),
  getEstimates: (): Promise<Document[]> => apiFetch('/admin/estimates'),
  getDataEntryReceipts: (date?: string): Promise<any[]> => apiFetch(`/data-entry/receipts${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  updateDataEntryStatus: (id: number, isDone: boolean): Promise<void> => apiFetch(`/receipts/${id}/data-entry`, { method: 'PUT', body: JSON.stringify({ isDone }) }),
  getClientAnalysis: (): Promise<any> => apiFetch('/client/analysis'),
  getPendingReportAlarms: (): Promise<{ warningCount: number; alarmCount: number; criticalList: any[] }> => apiFetch('/reports/pending-alarm'),
  dismissPendingAlarm: (id: number): Promise<{ success: boolean; message: string }> => apiFetch(`/reports/dismiss-alarm/${id}`, { method: 'POST' }),
  getSystemStatus: (): Promise<any> => apiFetch('/admin/system-status'),
  getBIMetrics: (): Promise<{ mostUsedTests: any[]; mostUsedLabs: any[] }> => apiFetch('/admin/bi-metrics'),


  // --- Admin: User Management ---
  createUser: async (userData: any): Promise<User> => {
    const payload = { ...userData };
    if (payload.password) {
      payload.password = await sha256(payload.password);
    }
    if (payload.password_hash) {
      payload.password_hash = await sha256(payload.password_hash);
    }
    return apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateUser: async (userData: any): Promise<void> => {
    const payload = { ...userData };
    if (payload.password) {
      payload.password = await sha256(payload.password);
    }
    if (payload.password_hash) {
      payload.password_hash = await sha256(payload.password_hash);
    }
    return apiFetch(`/users/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteUser: (userId: number): Promise<void> => apiFetch(`/users/${userId}`, { method: 'DELETE' }),

  // --- Admin: Branch Management ---
  createBranch: (branchData: Omit<Branch, 'id'>): Promise<Branch> => apiFetch('/branches', { method: 'POST', body: JSON.stringify(branchData) }),
  updateBranch: (branchData: Branch): Promise<void> => apiFetch(`/branches/${branchData.id}`, { method: 'PUT', body: JSON.stringify(branchData) }),
  deleteBranch: (branchId: number): Promise<void> => apiFetch(`/branches/${branchId}`, { method: 'DELETE' }),

  // --- Admin: Lab Management ---
  createLab: (name: string): Promise<Lab> => apiFetch('/labs', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteLab: (labId: number): Promise<void> => apiFetch(`/labs/${labId}`, { method: 'DELETE' }),
  updateLabLists: (labId: number, listIds: number[]): Promise<void> => apiFetch(`/labs/${labId}/lists`, { method: 'PUT', body: JSON.stringify({ listIds }) }),
  updateLabLogo: (labId: number, logoBase64: string): Promise<{ logoPath: string }> => apiFetch(`/labs/${labId}/logo`, { method: 'PUT', body: JSON.stringify({ logoBase64 }) }),

  // --- Admin: Package & List Management ---
  createPackageList: (name: string): Promise<PackageList> => apiFetch('/package-lists', { method: 'POST', body: JSON.stringify({ name }) }),
  deletePackageList: (listId: number): Promise<void> => apiFetch(`/package-lists/${listId}`, { method: 'DELETE' }),
  uploadPackages: (listId: number, packages: any[], mode: 'OVERWRITE' | 'APPEND' = 'OVERWRITE'): Promise<{ inserted: number; updated: number }> => apiFetch(`/package-lists/${listId}/upload`, { method: 'POST', body: JSON.stringify({ packages, mode }) }),
  clonePackageList: (id: number, sourceListId: number, discountPercent: number, markupPercent: number): Promise<{ message: string }> => apiFetch(`/package-lists/${id}/clone`, { method: 'POST', body: JSON.stringify({ sourceListId, discountPercent, markupPercent }) }),
  addPackageToList: (pkgData: Omit<Package, 'id'>): Promise<Package> => apiFetch('/packages', { method: 'POST', body: JSON.stringify(pkgData) }),
  updatePackageInList: (pkgData: Package): Promise<void> => apiFetch(`/packages/${pkgData.id}`, { method: 'PUT', body: JSON.stringify(pkgData) }),
  deletePackageFromList: (packageId: number): Promise<void> => apiFetch(`/packages/${packageId}`, { method: 'DELETE' }),
  autoCreateClientList: (username: string, labId: number): Promise<{ id: number; name: string }> => apiFetch('/package-lists/auto-create-client-list', { method: 'POST', body: JSON.stringify({ username, labId }) }),
  updatePackageListName: (id: number, name: string): Promise<void> => apiFetch(`/package-lists/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  // --- Master Ratelist & Aliases ---
  getMasterPackages: (): Promise<MasterPackage[]> => apiFetch('/master-packages'),
  createMasterPackage: (name: string, code_name?: string): Promise<MasterPackage> => apiFetch('/master-packages', { method: 'POST', body: JSON.stringify({ name, code_name }) }),
  deleteMasterPackage: (id: number): Promise<void> => apiFetch(`/master-packages/${id}`, { method: 'DELETE' }),
  addMasterPackageAlias: (masterPackageId: number, alias_name: string): Promise<{ id: number; alias_name: string }> => apiFetch(`/master-packages/${masterPackageId}/aliases`, { method: 'POST', body: JSON.stringify({ alias_name }) }),
  acceptMasterPackages: (listId: number, packageNames: string[]): Promise<{ inserted: number; message: string }> => apiFetch(`/package-lists/${listId}/accept-master-packages`, { method: 'POST', body: JSON.stringify({ packageNames }) }),

  // --- Doctors & Settings ---
  getDoctors: (): Promise<string[]> => apiFetch('/doctors'),
  getAdminSettings: (): Promise<AdminSettings> => apiFetch('/admin/settings'),
  updateAdminSettings: (settings: Partial<AdminSettings>): Promise<{ message: string; settings: AdminSettings }> => apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // --- Admin: Wallet Management ---
  updateWallet: (clientId: number, action: 'add' | 'deduct' | 'settle', amount?: number, notes?: string): Promise<void> => apiFetch('/wallets/update', { method: 'PUT', body: JSON.stringify({ clientId, action, amount, notes }) }),
  updateWalletPermissions: (clientId: number, allow: boolean, until?: string): Promise<void> => apiFetch('/wallets/permissions', { method: 'PUT', body: JSON.stringify({ clientId, allow, until }) }),

  // --- Admin: Customer Management ---
  updateCustomer: (customerData: Customer): Promise<void> => apiFetch(`/customers/${customerData.id}`, { method: 'PUT', body: JSON.stringify(customerData) }),
  deleteCustomer: (id: number): Promise<void> => apiFetch(`/admin/customers/${id}`, { method: 'DELETE' }),

  // --- Admin: Transaction & Receipt Management ---
  getTransactionsByUser: (userId: number): Promise<Transaction[]> => apiFetch(`/admin/transactions/user/${userId}`),
  revertTransaction: (id: number): Promise<void> => apiFetch(`/admin/transactions/${id}/revert`, { method: 'DELETE' }),
  deleteTransactionRecord: (id: number): Promise<void> => apiFetch(`/admin/transactions/${id}/delete`, { method: 'DELETE' }),
  revertReceipt: (id: number): Promise<void> => apiFetch(`/admin/receipts/${id}/revert`, { method: 'DELETE' }),
  deleteReceipt: (id: number): Promise<void> => apiFetch(`/admin/receipts/${id}`, { method: 'DELETE' }),

  // --- Reports (Client & Admin) ---
  uploadReport: (formData: FormData): Promise<{ reportId: number }> => {
    // Don't use apiFetch since we need to let the browser set the boundary headers for FormData
    const csrfToken = getCookie('XSRF-TOKEN');
    const headers: Record<string, string> = {};
    if (csrfToken) {
      headers['X-XSRF-TOKEN'] = csrfToken;
    }
    return fetch('/api/reports/upload', {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
    }).then(async res => {
      if (res.ok) return res.json();
      let errMsg = 'Upload failed';
      try {
        const errJson = await res.json();
        errMsg = errJson.message || errJson.error || errMsg;
      } catch (e) {}
      throw new Error(errMsg);
    });
  },
  getReportsAdmin: (): Promise<LabReport[]> => apiFetch('/reports'),
  getReportsClient: (): Promise<LabReport[]> => apiFetch('/reports/client'),
  deleteReport: (id: number): Promise<void> => apiFetch(`/reports/${id}`, { method: 'DELETE' }),
  markReportAsRead: (id: number): Promise<void> => apiFetch(`/reports/${id}/read`, { method: 'PUT' }),

  // --- Estimate Comparison ---
  uploadComparisonData: (formData: FormData): Promise<void> => {
    const csrfToken = getCookie('XSRF-TOKEN');
    const headers: Record<string, string> = {};
    if (csrfToken) {
      headers['X-XSRF-TOKEN'] = csrfToken;
    }
    return fetch('/api/comparison/upload', {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
    }).then(async res => {
      if (res.ok) return res.json();
      let errMsg = 'Upload failed';
      try {
        const errJson = await res.json();
        errMsg = errJson.message || errJson.error || errMsg;
      } catch (e) {}
      throw new Error(errMsg);
    });
  },
  getComparisonData: (): Promise<{ tests: any[]; labs: any[]; prices: any[] }> => apiFetch('/comparison/data'),
  addComparisonTest: (name: string, prices: { lab_id: number; price: number }[]): Promise<{ id: number; message: string }> => apiFetch('/comparison/tests', { method: 'POST', body: JSON.stringify({ name, prices }) }),
  updateComparisonTest: (id: number, name: string, prices: { lab_id: number; price: number }[]): Promise<{ message: string }> => apiFetch(`/comparison/tests/${id}`, { method: 'PUT', body: JSON.stringify({ name, prices }) }),
  deleteComparisonTest: (id: number): Promise<void> => apiFetch(`/comparison/tests/${id}`, { method: 'DELETE' }),
  addComparisonLab: (name: string): Promise<{ id: number; message: string }> => apiFetch('/comparison/labs', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteComparisonLab: (id: number): Promise<void> => apiFetch(`/comparison/labs/${id}`, { method: 'DELETE' }),
};