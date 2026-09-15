import api from './client';

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
};

export const dashboardApi = {
  get: (academicYearId) =>
    api.get('/dashboard', { params: { academicYearId } }),
};

export const studentsApi = {
  list: (params?: Record<string, unknown>) => api.get('/students', { params }),
  create: (data: Record<string, unknown>) => api.post('/students', data),
  get: (id: string) => api.get(`/students/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/students/${id}`, data),
  setStatus: (id: string, status: string) => api.patch(`/students/${id}/status`, { status }),
  promote: (data: { student_ids: string[]; target_class?: string }) =>
    api.post('/students/promote', data),
  tuition: (id: string, yearId: string) => api.get(`/students/${id}/years/${yearId}/tuition`),
  payments: (id: string) => api.get(`/students/${id}/payments`),
};

export const yearsApi = {
  list: () => api.get('/academic-years'),
  nextStart: () => api.get('/academic-years/next-start'),
  create: (data: Record<string, unknown>) => api.post('/academic-years', data),
  get: (id: string) => api.get(`/academic-years/${id}`),
  delete: (id: string) => api.delete(`/academic-years/${id}`),
};

export const billingApi = {
  payBill: (id: string, data: Record<string, unknown>) => api.post(`/bills/${id}/pay`, data),
  payTuitionBulk: (data: Record<string, unknown>) => api.post('/tuition/collect-bulk', data),
  collect: (data: Record<string, unknown>) => api.post('/collections', data),
  feeItems: (feeTypeId: string) =>
    api.get(`/fee-types/${feeTypeId}/items`),
  feeItemsQuery: (feeTypeId: string) =>
    api.get('/fee-items', { params: { feeTypeId } }),
  receiptUrl: (paymentId: string) => `/api/payments/${paymentId}/receipt.pdf`,
  receiptByNoUrl: (receiptNo: string) => `/api/payments/receipt/${receiptNo}/pdf`,
};

export const settingsApi = {
  feeTypes: () => api.get('/settings/fee-types'),
  saveFeeType: (data: { id?: string } & Record<string, unknown>) =>
    data.id
      ? api.put(`/settings/fee-types/${data.id}`, data)
      : api.post('/settings/fee-types', data),
  retireFeeType: (id: string) => api.patch(`/settings/fee-types/${id}/retire`),
  deleteFeeType: (id: string) => api.delete(`/settings/fee-types/${id}`),
  classes: () => api.get('/settings/classes'),
  addClass: (name: string) => api.post('/settings/classes', { name }),
  retireClass: (id: string) => api.patch(`/settings/classes/${id}/retire`),
  classFees: (academicYearId: string) =>
    api.get('/settings/class-fees', { params: { academicYearId } }),
  saveClassFee: (data: Record<string, unknown>) => api.post('/settings/class-fees', data),
  feeItems: (feeTypeId?: string) =>
    api.get('/settings/fee-items', { params: { feeTypeId } }),
  saveFeeItem: (data: { id?: string } & Record<string, unknown>) =>
    data.id
      ? api.put(`/settings/fee-items/${data.id}`, data)
      : api.post('/settings/fee-items', data),
  retireFeeItem: (id: string) => api.patch(`/settings/fee-items/${id}/retire`),
  lateFee: () => api.get('/settings/late-fee'),
  saveLateFee: (data: Record<string, unknown>) => api.put('/settings/late-fee', data),
};

export const reportsApi = {
  tuitionStatus: (academicYearId: string, classId?: string) =>
    api.get('/reports/tuition-status', { params: { academicYearId, ...(classId ? { classId } : {}) } }),
  collectionsByType: (academicYearId: string) =>
    api.get('/reports/collections-by-type', { params: { academicYearId } }),
  outstanding: (academicYearId: string) =>
    api.get('/reports/outstanding-tuition', { params: { academicYearId } }),
  yearSummary: (academicYearId: string) =>
    api.get('/reports/year-summary', { params: { academicYearId } }),
  studentLedger: (studentId: string) =>
    api.get(`/reports/student-ledger/${studentId}`),
  exportUrl: (kind: string, params: Record<string, string>) => {
    if (kind === 'student-ledger') {
      return `/api/reports/student-ledger/${params.studentId}?format=${params.format}`;
    }
    const q = new URLSearchParams(params).toString();
    return `/api/reports/${kind}?${q}`;
  },
};
