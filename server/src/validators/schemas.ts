import { z } from 'zod';
import { categories, priorities, reimbursementCurrencies, statuses } from '../models/Claim.js';

const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const password = z.string().min(8).max(128);
export const registerSchema = z.object({ fullName: z.string().trim().min(2).max(100), email, password });
export const loginSchema = z.object({ email, password: z.string().min(1) });
export const claimSchema = z.object({
  productName: z.string().trim().min(2).max(120),
  productCategory: z.enum(categories),
  modelNumber: z.string().trim().max(100).optional().or(z.literal('')),
  purchaseDate: z.coerce.date().refine(value => value <= new Date(), 'Purchase date cannot be in the future'),
  issueDescription: z.string().trim().min(15).max(3000),
});
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(80).default(''),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
});
export const updateSchema = z.object({
  status: z.enum(statuses).optional(),
  adminNote: z.string().trim().max(2000).optional(),
}).refine(value => value.status !== undefined || value.adminNote !== undefined, 'No changes provided');

export const issueReimbursementSchema = z.object({
  amount: z.number().finite().positive().max(1_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Use at most two decimal places'),
  currency: z.enum(reimbursementCurrencies),
});

const voucherCode = z.string().trim().toUpperCase().regex(/^CTP-[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/, 'Enter the voucher code shown on the PDF');
export const verifyVoucherSchema = z.object({ voucherCode });
export const collectReimbursementSchema = z.object({ voucherCode, originalReceiptVerified: z.literal(true) });
