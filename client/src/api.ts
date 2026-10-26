import axios from 'axios';
import type { Claim, Paginated, User } from './types';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api' });
api.interceptors.request.use(config => { const token = sessionStorage.getItem('caretrack_token'); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use(undefined, async error => {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob && error.response.data.type.includes('json')) {
    try { error.response.data = JSON.parse(await error.response.data.text()); } catch { /* Keep the original response if it is not valid JSON. */ }
  }
  return Promise.reject(error);
});

type ErrorBody = { message?: unknown; details?: unknown };
export function errorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Something went wrong. Please try again.';
  if (!error.response) return 'Unable to reach the server. Check your connection and try again.';
  const body: ErrorBody = error.response.data && typeof error.response.data === 'object' && !(error.response.data instanceof Blob) ? error.response.data : {};
  const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : 'Request failed';
  if (!body.details || typeof body.details !== 'object' || Array.isArray(body.details)) return message;
  const issues = Object.entries(body.details).flatMap(([field, value]) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()).map(item => `${field}: ${item}`) : [],
  );
  return issues.length ? `${message}. ${issues.slice(0, 2).join('; ')}${issues.length > 2 ? '; check the other fields' : ''}` : message;
}
export const authApi = {
  login: (values: { email: string; password: string }) => api.post<{ user: User; token: string }>('/auth/login', values).then(r => r.data),
  register: (values: { fullName: string; email: string; password: string }) => api.post<{ user: User; token: string }>('/auth/register', values).then(r => r.data),
  me: () => api.get<{ user: User }>('/auth/me').then(r => r.data.user),
};
export const claimApi = {
  list: (role: 'CUSTOMER' | 'ADMIN', params: Record<string, string | number | undefined>) => api.get<Paginated<Claim>>(role === 'ADMIN' ? '/admin/claims' : '/claims/my', { params }).then(r => r.data),
  detail: (role: 'CUSTOMER' | 'ADMIN', id: string) => api.get<{ data: Claim }>(role === 'ADMIN' ? `/admin/claims/${id}` : `/claims/${id}`).then(r => r.data.data),
  create: (body: FormData) => api.post<{ data: Claim }>('/claims', body).then(r => r.data.data),
  update: (id: string, body: { status?: string; adminNote?: string }) => api.patch<{ data: Claim }>(`/admin/claims/${id}`, body).then(r => r.data.data),
  retryAnalysis: (id: string) => api.post<{ data: Claim }>(`/admin/claims/${id}/analysis`).then(r => r.data.data),
  receipt: (role: 'CUSTOMER' | 'ADMIN', id: string) => api.get(role === 'ADMIN' ? `/admin/claims/${id}/receipt` : `/claims/${id}/receipt`, { responseType: 'blob' }).then(r => r.data as Blob),
  voucher: (role: 'CUSTOMER' | 'ADMIN', id: string) => api.get(role === 'ADMIN' ? `/admin/claims/${id}/voucher` : `/claims/${id}/voucher`, { responseType: 'blob' }).then(r => r.data as Blob),
  issueReimbursement: (id: string, body: { amount: number; currency: string }) => api.post<{ data: Claim }>(`/admin/claims/${id}/reimbursement`, body).then(r => r.data.data),
  verifyVoucher: (id: string, voucherCode: string) => api.post<{ valid: boolean; claimNumber: string; amountMinor: number; currency: string }>(`/admin/claims/${id}/reimbursement/verify`, { voucherCode }).then(r => r.data),
  collectReimbursement: (id: string, voucherCode: string) => api.post<{ data: Claim }>(`/admin/claims/${id}/reimbursement/collect`, { voucherCode, originalReceiptVerified: true }).then(r => r.data.data),
};
