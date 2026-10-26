export type Role = 'CUSTOMER' | 'ADMIN';
export type Status = 'SUBMITTED' | 'UNDER_REVIEW' | 'IN_PROGRESS' | 'RESOLVED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type AIStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';
export interface User { id: string; fullName: string; email: string; role: Role }
export interface Analysis { summary: string; category: string; priority: Priority; suggestedAction: string }
export interface Reimbursement {
  amountMinor: number; currency: 'PKR' | 'USD' | 'EUR' | 'GBP'; voucherCode: string;
  pickupAddress: string; status: 'READY_FOR_COLLECTION' | 'COLLECTED';
  issuedAt: string; collectedAt?: string; originalReceiptVerifiedAt?: string;
}
export interface Claim {
  _id: string; claimNumber: string; customerId: string | { _id: string; fullName: string; email: string };
  productName: string; productCategory: string; modelNumber?: string; purchaseDate: string; issueDescription: string;
  receiptId: string; status: Status; adminNote?: string; aiAnalysis?: Analysis; aiStatus?: AIStatus; reimbursement?: Reimbursement;
  statusHistory: { status: Status; changedAt: string; changedBy?: string }[]; createdAt: string; updatedAt: string;
}
export interface Paginated<T> { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number }; stats: Record<string, number> }
