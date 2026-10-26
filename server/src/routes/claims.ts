import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import mongoose, { type FilterQuery } from 'mongoose';
import multer from 'multer';
import { Claim, statuses, type ClaimDocument } from '../models/Claim.js';
import { Receipt } from '../models/Receipt.js';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assessPersistedClaim } from '../services/claimAnalysis.service.js';
import { getEnv } from '../config/env.js';
import { claimSchema, collectReimbursementSchema, issueReimbursementSchema, listSchema, updateSchema, verifyVoucherSchema } from '../validators/schemas.js';
import { asyncRoute, HttpError } from '../utils/http.js';
import { createPickupVoucherPdf, newVoucherCode, voucherCodeMatches } from '../services/reimbursement.service.js';

export const claimsRouter = Router();
export const adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) });
const validSignature = (buffer: Buffer, type: string) => type === 'image/jpeg'
  ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  : type === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-';
const id = (value: string) => { if (!mongoose.isValidObjectId(value)) throw new HttpError(404, 'Claim not found'); return value; };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pagination = (page: number, limit: number, total: number) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });

claimsRouter.use(requireAuth, requireRole('CUSTOMER'));
claimsRouter.post('/', upload.single('receipt'), asyncRoute(async (req, res) => {
  const input = claimSchema.parse(req.body);
  if (!req.file || !validSignature(req.file.buffer, req.file.mimetype)) throw new HttpError(400, 'A valid JPG, PNG, or PDF receipt is required');
  const receipt = await Receipt.create({ filename: `${randomBytes(16).toString('hex')}`, originalName: req.file.originalname, contentType: req.file.mimetype, size: req.file.size, data: req.file.buffer });
  const aiEnabled = Boolean(getEnv().GEMINI_API_KEY);
  let claim: ClaimDocument;
  try {
    claim = await Claim.create({
      ...input, customerId: req.auth!.id, receiptId: receipt.id,
      claimNumber: `CT-${new Date().getFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`,
      status: 'SUBMITTED', aiStatus: aiEnabled ? 'PENDING' : 'UNAVAILABLE', statusHistory: [{ status: 'SUBMITTED', changedAt: new Date(), changedBy: req.auth!.id }],
    });
  } catch (error) { await Receipt.findByIdAndDelete(receipt.id); throw error; }
  res.status(201).json({ data: claim });
  if (aiEnabled) void assessPersistedClaim(String(claim._id), input);
}));

claimsRouter.get('/my', asyncRoute(async (req, res) => {
  const { page, limit, search, status } = listSchema.parse(req.query);
  const filter: FilterQuery<ClaimDocument> = { customerId: req.auth!.id };
  if (status) filter.status = status;
  if (search) filter.$or = [{ claimNumber: { $regex: escapeRegex(search), $options: 'i' } }, { productName: { $regex: escapeRegex(search), $options: 'i' } }];
  const [data, total, resolved, all] = await Promise.all([
    Claim.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Claim.countDocuments(filter), Claim.countDocuments({ customerId: req.auth!.id, status: 'RESOLVED' }), Claim.countDocuments({ customerId: req.auth!.id }),
  ]);
  res.json({ data, pagination: pagination(page, limit, total), stats: { total: all, active: all - resolved, resolved } });
}));

claimsRouter.get('/:id', asyncRoute(async (req, res) => {
  const claim = await Claim.findOne({ _id: id(req.params.id), customerId: req.auth!.id }).lean();
  if (!claim) throw new HttpError(404, 'Claim not found');
  res.json({ data: claim });
}));

async function sendReceipt(req: import('express').Request, res: import('express').Response) {
  const claim = await Claim.findById(id(req.params.id)).select('customerId receiptId');
  if (!claim || (req.auth!.role !== 'ADMIN' && String(claim.customerId) !== req.auth!.id)) throw new HttpError(404, 'Receipt not found');
  const receipt = await Receipt.findById(claim.receiptId).select('+data');
  if (!receipt) throw new HttpError(404, 'Receipt not found');
  res.set({ 'Content-Type': receipt.contentType, 'Content-Length': String(receipt.size), 'Content-Disposition': `inline; filename="receipt.${receipt.contentType === 'application/pdf' ? 'pdf' : receipt.contentType === 'image/png' ? 'png' : 'jpg'}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(receipt.data);
}
claimsRouter.get('/:id/receipt', asyncRoute(sendReceipt));

async function sendVoucher(req: import('express').Request, res: import('express').Response) {
  const claim = await Claim.findById(id(req.params.id));
  if (!claim || (req.auth!.role !== 'ADMIN' && String(claim.customerId) !== req.auth!.id)) throw new HttpError(404, 'Voucher not found');
  if (!claim.reimbursement) throw new HttpError(404, 'Voucher not found');
  const customer = await User.findById(claim.customerId).select('fullName');
  const pdf = await createPickupVoucherPdf({ claimNumber: claim.claimNumber, customerName: customer?.fullName || 'Customer', productName: claim.productName, reimbursement: claim.reimbursement });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.length), 'Content-Disposition': `attachment; filename="${claim.claimNumber}-pickup-voucher.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(pdf);
}
claimsRouter.get('/:id/voucher', asyncRoute(sendVoucher));

adminRouter.use(requireAuth, requireRole('ADMIN'));
adminRouter.get('/claims', asyncRoute(async (req, res) => {
  const { page, limit, search, status, priority } = listSchema.parse(req.query);
  const filter: FilterQuery<ClaimDocument> = {};
  if (status) filter.status = status;
  if (priority) filter['aiAnalysis.priority'] = priority;
  if (search) {
    const escaped = escapeRegex(search);
    const users = await User.find({ fullName: { $regex: escaped, $options: 'i' } }).select('_id').limit(200).lean();
    filter.$or = [{ claimNumber: { $regex: escaped, $options: 'i' } }, { productName: { $regex: escaped, $options: 'i' } }, { customerId: { $in: users.map(user => user._id) } }];
  }
  const [data, total, all, submitted, inProgress, resolved] = await Promise.all([
    Claim.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('customerId', 'fullName email').lean(),
    Claim.countDocuments(filter), Claim.countDocuments(), Claim.countDocuments({ status: 'SUBMITTED' }),
    Claim.countDocuments({ status: 'IN_PROGRESS' }), Claim.countDocuments({ status: 'RESOLVED' }),
  ]);
  res.json({ data, pagination: pagination(page, limit, total), stats: { total: all, submitted, inProgress, resolved } });
}));

adminRouter.get('/claims/:id', asyncRoute(async (req, res) => {
  const claim = await Claim.findById(id(req.params.id)).populate('customerId', 'fullName email').lean();
  if (!claim) throw new HttpError(404, 'Claim not found');
  res.json({ data: claim });
}));

adminRouter.patch('/claims/:id', asyncRoute(async (req, res) => {
  const update = updateSchema.parse(req.body);
  const claim = await Claim.findById(id(req.params.id));
  if (!claim) throw new HttpError(404, 'Claim not found');
  if (update.status && update.status !== claim.status) {
    if (update.status === 'RESOLVED' && claim.reimbursement?.status === 'READY_FOR_COLLECTION') throw new HttpError(409, 'Confirm reimbursement collection before resolving this claim');
    if (statuses.indexOf(update.status) !== statuses.indexOf(claim.status) + 1) throw new HttpError(400, 'Status must advance to the next step');
    claim.status = update.status;
    claim.statusHistory.push({ status: update.status, changedAt: new Date(), changedBy: new mongoose.Types.ObjectId(req.auth!.id) });
  }
  if (update.adminNote !== undefined) claim.adminNote = update.adminNote;
  await claim.save();
  await claim.populate('customerId', 'fullName email');
  res.json({ data: claim });
}));

adminRouter.post('/claims/:id/reimbursement', asyncRoute(async (req, res) => {
  const { amount, currency } = issueReimbursementSchema.parse(req.body);
  const claimId = id(req.params.id);
  const now = new Date();
  const actor = new mongoose.Types.ObjectId(req.auth!.id);
  const reimbursement = {
    amountMinor: Math.round(amount * 100), currency, voucherCode: newVoucherCode(),
    pickupAddress: getEnv().PICKUP_ADDRESS, status: 'READY_FOR_COLLECTION' as const,
    issuedAt: now, issuedBy: actor,
  };
  const noVoucher = { _id: claimId, reimbursement: { $exists: false } };
  const claim = await Claim.findOneAndUpdate(
    { ...noVoucher, status: 'UNDER_REVIEW' },
    { $set: { reimbursement, status: 'IN_PROGRESS' }, $push: { statusHistory: { status: 'IN_PROGRESS', changedAt: now, changedBy: actor } } },
    { new: true },
  ) || await Claim.findOneAndUpdate(
    { ...noVoucher, status: 'IN_PROGRESS' },
    { $set: { reimbursement } },
    { new: true },
  );
  if (!claim) {
    if (!await Claim.exists({ _id: claimId })) throw new HttpError(404, 'Claim not found');
    throw new HttpError(409, 'Move the claim to Under review or In progress, and ensure no voucher has already been issued');
  }
  res.status(201).json({ data: claim });
}));

adminRouter.post('/claims/:id/reimbursement/verify', asyncRoute(async (req, res) => {
  const { voucherCode } = verifyVoucherSchema.parse(req.body);
  const claim = await Claim.findById(id(req.params.id));
  if (!claim) throw new HttpError(404, 'Claim not found');
  if (!claim.reimbursement) throw new HttpError(404, 'Voucher not found');
  if (claim.reimbursement.status !== 'READY_FOR_COLLECTION') throw new HttpError(409, 'This voucher is no longer awaiting collection');
  if (!voucherCodeMatches(claim.reimbursement.voucherCode, voucherCode)) throw new HttpError(400, 'Voucher code does not match this claim');
  res.json({ valid: true, claimNumber: claim.claimNumber, amountMinor: claim.reimbursement.amountMinor, currency: claim.reimbursement.currency });
}));

adminRouter.post('/claims/:id/reimbursement/collect', asyncRoute(async (req, res) => {
  const { voucherCode } = collectReimbursementSchema.parse(req.body);
  const claimId = id(req.params.id);
  const existing = await Claim.findById(claimId);
  if (!existing) throw new HttpError(404, 'Claim not found');
  if (!existing.reimbursement) throw new HttpError(404, 'Voucher not found');
  if (existing.reimbursement.status !== 'READY_FOR_COLLECTION' || existing.status !== 'IN_PROGRESS') throw new HttpError(409, 'This claim is not awaiting reimbursement collection');
  if (!voucherCodeMatches(existing.reimbursement.voucherCode, voucherCode)) throw new HttpError(400, 'Voucher code does not match this claim');
  const now = new Date();
  const actor = new mongoose.Types.ObjectId(req.auth!.id);
  const claim = await Claim.findOneAndUpdate(
    { _id: claimId, status: 'IN_PROGRESS', 'reimbursement.status': 'READY_FOR_COLLECTION', 'reimbursement.voucherCode': voucherCode },
    { $set: { status: 'RESOLVED', 'reimbursement.status': 'COLLECTED', 'reimbursement.collectedAt': now, 'reimbursement.collectedBy': actor, 'reimbursement.originalReceiptVerifiedAt': now },
      $push: { statusHistory: { status: 'RESOLVED', changedAt: now, changedBy: actor } } },
    { new: true },
  );
  if (!claim) throw new HttpError(409, 'Collection was already recorded or the claim changed');
  res.json({ data: claim });
}));

adminRouter.post('/claims/:id/analysis', asyncRoute(async (req, res) => {
  if (!getEnv().GEMINI_API_KEY) throw new HttpError(503, 'AI assessment is not configured');
  const claimId = id(req.params.id);
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
  const claim = await Claim.findOneAndUpdate(
    { _id: claimId, aiAnalysis: { $exists: false }, $or: [
      { aiStatus: 'FAILED' }, { aiStatus: 'UNAVAILABLE' }, { aiStatus: { $exists: false } },
      { aiStatus: 'PENDING', updatedAt: { $lt: staleBefore } },
    ] },
    { $set: { aiStatus: 'PENDING' } },
    { new: true },
  );
  if (!claim) {
    if (!await Claim.exists({ _id: claimId })) throw new HttpError(404, 'Claim not found');
    throw new HttpError(409, 'Assessment is already in progress or completed');
  }
  res.status(202).json({ data: claim });
  void assessPersistedClaim(claimId, {
    productName: claim.productName, productCategory: claim.productCategory,
    modelNumber: claim.modelNumber, issueDescription: claim.issueDescription,
  });
}));

adminRouter.get('/claims/:id/receipt', asyncRoute(sendReceipt));
adminRouter.get('/claims/:id/voucher', asyncRoute(sendVoucher));
