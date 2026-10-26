import mongoose, { Schema, Types } from 'mongoose';

export const statuses = ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED'] as const;
export type ClaimStatus = typeof statuses[number];
export const categories = ['Fan', 'Kitchen Appliance', 'Home Appliance', 'Electrical Appliance', 'Other'] as const;
export type ProductCategory = typeof categories[number];
export const priorities = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Priority = typeof priorities[number];
export const issueCategories = ['Electrical', 'Mechanical', 'Performance', 'Physical Damage', 'Other'] as const;
export const aiStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'UNAVAILABLE'] as const;
export type AIStatus = typeof aiStatuses[number];
export const reimbursementCurrencies = ['PKR', 'USD', 'EUR', 'GBP'] as const;
export type ReimbursementCurrency = typeof reimbursementCurrencies[number];
export const reimbursementStatuses = ['READY_FOR_COLLECTION', 'COLLECTED'] as const;
export type ReimbursementStatus = typeof reimbursementStatuses[number];

export interface AIAnalysis {
  summary: string;
  category: typeof issueCategories[number];
  priority: Priority;
  suggestedAction: string;
}

export interface Reimbursement {
  amountMinor: number;
  currency: ReimbursementCurrency;
  voucherCode: string;
  pickupAddress: string;
  status: ReimbursementStatus;
  issuedAt: Date;
  issuedBy: Types.ObjectId;
  collectedAt?: Date;
  collectedBy?: Types.ObjectId;
  originalReceiptVerifiedAt?: Date;
}

export interface ClaimDocument extends mongoose.Document {
  claimNumber: string;
  customerId: Types.ObjectId;
  productName: string;
  productCategory: ProductCategory;
  modelNumber?: string;
  purchaseDate: Date;
  issueDescription: string;
  receiptId: Types.ObjectId;
  status: ClaimStatus;
  adminNote?: string;
  aiAnalysis?: AIAnalysis;
  aiStatus: AIStatus;
  reimbursement?: Reimbursement;
  statusHistory: { status: ClaimStatus; changedAt: Date; changedBy?: Types.ObjectId }[];
  createdAt: Date;
  updatedAt: Date;
}

const reimbursementSchema = new Schema<Reimbursement>({
  amountMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: reimbursementCurrencies, required: true },
  voucherCode: { type: String, required: true },
  pickupAddress: { type: String, required: true },
  status: { type: String, enum: reimbursementStatuses, required: true },
  issuedAt: { type: Date, required: true },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  collectedAt: Date,
  collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  originalReceiptVerifiedAt: Date,
}, { _id: false });

const claimSchema = new Schema<ClaimDocument>({
  claimNumber: { type: String, required: true, unique: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productName: { type: String, required: true, trim: true },
  productCategory: { type: String, enum: categories, required: true },
  modelNumber: { type: String, trim: true },
  purchaseDate: { type: Date, required: true },
  issueDescription: { type: String, required: true, trim: true },
  receiptId: { type: Schema.Types.ObjectId, ref: 'Receipt', required: true },
  status: { type: String, enum: statuses, default: 'SUBMITTED', index: true },
  adminNote: { type: String, default: '' },
  aiAnalysis: { summary: String, category: { type: String, enum: issueCategories }, priority: { type: String, enum: priorities, index: true }, suggestedAction: String },
  aiStatus: { type: String, enum: aiStatuses, default: 'UNAVAILABLE' },
  reimbursement: { type: reimbursementSchema, default: undefined },
  statusHistory: [{ status: { type: String, enum: statuses, required: true }, changedAt: { type: Date, required: true }, changedBy: { type: Schema.Types.ObjectId, ref: 'User' } }],
}, { timestamps: true });

claimSchema.index({ createdAt: -1 });
claimSchema.index({ customerId: 1, createdAt: -1 });
claimSchema.index({ 'reimbursement.voucherCode': 1 }, { unique: true, sparse: true });

export const Claim = mongoose.model<ClaimDocument>('Claim', claimSchema);
