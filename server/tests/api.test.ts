import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.MONGODB_URI = 'mongodb://localhost:27017/caretrack-test';
process.env.JWT_SECRET = 'caretrack-test-secret-32-characters-minimum';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.GEMINI_API_KEY = 'test-key';

const mocks = vi.hoisted(() => ({
  userExists: vi.fn(), userCreate: vi.fn(), userFindOne: vi.fn(), userFindById: vi.fn(),
  receiptCreate: vi.fn(), receiptDelete: vi.fn(), claimCreate: vi.fn(), claimFind: vi.fn(), claimCount: vi.fn(), claimFindById: vi.fn(), claimUpdate: vi.fn(), claimRetry: vi.fn(), claimExists: vi.fn(), analysis: vi.fn(),
}));
vi.mock('../src/models/User.js', () => ({ User: { exists: mocks.userExists, create: mocks.userCreate, findOne: mocks.userFindOne, findById: mocks.userFindById, find: vi.fn() } }));
vi.mock('../src/models/Receipt.js', () => ({ Receipt: { create: mocks.receiptCreate, findByIdAndDelete: mocks.receiptDelete } }));
vi.mock('../src/models/Claim.js', () => ({
  Claim: { create: mocks.claimCreate, find: mocks.claimFind, countDocuments: mocks.claimCount, findById: mocks.claimFindById, findByIdAndUpdate: mocks.claimUpdate, findOneAndUpdate: mocks.claimRetry, exists: mocks.claimExists },
  statuses: ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED'], reimbursementCurrencies: ['PKR', 'USD', 'EUR', 'GBP'], categories: ['Fan', 'Kitchen Appliance', 'Home Appliance', 'Electrical Appliance', 'Other'], priorities: ['LOW', 'MEDIUM', 'HIGH'], issueCategories: ['Electrical', 'Mechanical', 'Performance', 'Physical Damage', 'Other'],
}));
vi.mock('../src/services/ai.service.js', () => ({ analyzeClaim: mocks.analysis }));

import { createApp } from '../src/app.js';
const app = createApp();
const customerToken = jwt.sign({ role: 'CUSTOMER' }, process.env.JWT_SECRET!, { subject: '507f1f77bcf86cd799439011' });
const adminToken = jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET!, { subject: '507f1f77bcf86cd799439012' });
const validClaim = { productName: 'Electric kettle', productCategory: 'Kitchen Appliance', purchaseDate: '2025-01-02', issueDescription: 'The kettle stopped heating water.' };
const pdf = Buffer.from('%PDF-1.7\nexample');

beforeEach(() => { vi.clearAllMocks(); mocks.userExists.mockResolvedValue(null); mocks.receiptCreate.mockResolvedValue({ id: '507f1f77bcf86cd799439013' }); mocks.claimCount.mockResolvedValue(0); mocks.claimUpdate.mockResolvedValue(null); mocks.claimExists.mockResolvedValue(true); mocks.analysis.mockResolvedValue(null); });

describe('authentication and authorization', () => {
  it('registers a customer and does not accept an admin role', async () => {
    mocks.userCreate.mockImplementation(async data => ({ _id: '507f1f77bcf86cd799439011', ...data }));
    const response = await request(app).post('/api/auth/register').send({ fullName: 'Jane Smith', email: 'Jane@Example.com', password: 'longpassword', role: 'ADMIN' });
    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('CUSTOMER');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(mocks.userCreate.mock.calls[0][0].passwordHash).not.toBe('longpassword');
  });
  it('logs in with a valid password', async () => {
    const bcrypt = await import('bcryptjs');
    mocks.userFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', fullName: 'Jane Smith', email: 'jane@example.com', role: 'CUSTOMER', passwordHash: await bcrypt.hash('longpassword', 4) }) });
    const response = await request(app).post('/api/auth/login').send({ email: 'jane@example.com', password: 'longpassword' });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTypeOf('string');
  });
  it('requires a token and enforces the admin role', async () => {
    expect((await request(app).get('/api/claims/my')).status).toBe(401);
    expect((await request(app).get('/api/admin/claims').set('Authorization', `Bearer ${customerToken}`)).status).toBe(403);
  });
});

describe('reimbursement collection', () => {
  const claimId = '507f1f77bcf86cd799439014';
  const path = `/api/admin/claims/${claimId}/reimbursement`;
  const code = 'CTP-ABCD-1234-EF56-7890';
  const reimbursement = { amountMinor: 125000, currency: 'PKR', voucherCode: code, pickupAddress: 'CareTrack Demo Collection Desk', status: 'READY_FOR_COLLECTION', issuedAt: new Date('2026-01-01') };

  it('issues one voucher and advances an under-review claim to in progress', async () => {
    mocks.claimRetry.mockResolvedValueOnce({ status: 'IN_PROGRESS', reimbursement });
    const response = await request(app).post(path).set('Authorization', `Bearer ${adminToken}`).send({ amount: 1250, currency: 'PKR' });
    expect(response.status).toBe(201);
    expect(mocks.claimRetry.mock.calls[0][0]).toMatchObject({ status: 'UNDER_REVIEW', reimbursement: { $exists: false } });
    expect(mocks.claimRetry.mock.calls[0][1].$push.statusHistory.status).toBe('IN_PROGRESS');
    expect(mocks.claimRetry.mock.calls[0][1].$set.reimbursement.amountMinor).toBe(125000);
    expect(response.body.data.reimbursement.status).toBe('READY_FOR_COLLECTION');
  });

  it('rejects a second voucher and a direct resolve while collection is pending', async () => {
    mocks.claimRetry.mockResolvedValue(null);
    const second = await request(app).post(path).set('Authorization', `Bearer ${adminToken}`).send({ amount: 10, currency: 'PKR' });
    expect(second.status).toBe(409);
    mocks.claimFindById.mockResolvedValue({ status: 'IN_PROGRESS', reimbursement });
    const direct = await request(app).patch(`/api/admin/claims/${claimId}`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'RESOLVED' });
    expect(direct.status).toBe(409);
  });

  it('verifies the code and requires the original receipt attestation before collection', async () => {
    mocks.claimFindById.mockResolvedValue({ status: 'IN_PROGRESS', reimbursement });
    const wrong = await request(app).post(`${path}/verify`).set('Authorization', `Bearer ${adminToken}`).send({ voucherCode: 'CTP-0000-0000-0000-0000' });
    expect(wrong.status).toBe(400);
    const verified = await request(app).post(`${path}/verify`).set('Authorization', `Bearer ${adminToken}`).send({ voucherCode: code });
    expect(verified.status).toBe(200);
    expect(verified.body.valid).toBe(true);
    const unchecked = await request(app).post(`${path}/collect`).set('Authorization', `Bearer ${adminToken}`).send({ voucherCode: code, originalReceiptVerified: false });
    expect(unchecked.status).toBe(400);
    expect(mocks.claimRetry).not.toHaveBeenCalled();
  });

  it('records collection once and resolves the claim', async () => {
    mocks.claimFindById.mockResolvedValue({ status: 'IN_PROGRESS', reimbursement });
    mocks.claimRetry.mockResolvedValue({ status: 'RESOLVED', reimbursement: { ...reimbursement, status: 'COLLECTED' } });
    const response = await request(app).post(`${path}/collect`).set('Authorization', `Bearer ${adminToken}`).send({ voucherCode: code, originalReceiptVerified: true });
    expect(response.status).toBe(200);
    expect(mocks.claimRetry.mock.calls[0][0]).toMatchObject({ status: 'IN_PROGRESS', 'reimbursement.status': 'READY_FOR_COLLECTION', 'reimbursement.voucherCode': code });
    expect(mocks.claimRetry.mock.calls[0][1].$set.status).toBe('RESOLVED');
    expect(mocks.claimRetry.mock.calls[0][1].$set['reimbursement.status']).toBe('COLLECTED');
  });

  it('allows the owning customer to download the voucher PDF', async () => {
    mocks.claimFindById.mockResolvedValue({ claimNumber: 'CT-2026-TEST', customerId: '507f1f77bcf86cd799439011', productName: 'Kettle', reimbursement });
    mocks.userFindById.mockReturnValue({ select: vi.fn().mockResolvedValue({ fullName: 'Jane Smith' }) });
    const response = await request(app).get(`/api/claims/${claimId}/voucher`).set('Authorization', `Bearer ${customerToken}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get(`/api/claims/${claimId}/voucher`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(403);
    mocks.claimFindById.mockResolvedValue({ claimNumber: 'CT-2026-TEST', customerId: '507f1f77bcf86cd799439099', productName: 'Kettle', reimbursement });
    expect((await request(app).get(`/api/claims/${claimId}/voucher`).set('Authorization', `Bearer ${customerToken}`)).status).toBe(404);
  });
});

describe('claims', () => {
  it('rejects a fake receipt before writing data', async () => {
    const response = await request(app).post('/api/claims').set('Authorization', `Bearer ${customerToken}`).field(validClaim).attach('receipt', Buffer.from('not a PDF'), { filename: 'receipt.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(400);
    expect(mocks.receiptCreate).not.toHaveBeenCalled();
  });
  it('persists a valid claim when AI fails', async () => {
    const claim = { _id: '507f1f77bcf86cd799439014', status: 'SUBMITTED', aiStatus: 'PENDING', aiAnalysis: undefined };
    mocks.claimCreate.mockResolvedValue(claim);
    mocks.analysis.mockRejectedValue(new Error('Gemini unavailable'));
    const response = await request(app).post('/api/claims').set('Authorization', `Bearer ${customerToken}`).field(validClaim).attach('receipt', pdf, { filename: 'receipt.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(201);
    expect(mocks.receiptCreate).toHaveBeenCalledOnce();
    expect(mocks.claimCreate).toHaveBeenCalledOnce();
    expect(response.body.data.status).toBe('SUBMITTED');
    expect(response.body.data.aiStatus).toBe('PENDING');
    await vi.waitFor(() => expect(mocks.claimUpdate).toHaveBeenCalledWith(claim._id, { $set: { aiStatus: 'FAILED' } }));
  });
  it('returns a persisted claim without waiting for AI to finish', async () => {
    const claim = { _id: '507f1f77bcf86cd799439014', status: 'SUBMITTED', aiStatus: 'PENDING' };
    mocks.claimCreate.mockResolvedValue(claim);
    let finish!: (value: unknown) => void;
    mocks.analysis.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const response = await request(app).post('/api/claims').set('Authorization', `Bearer ${customerToken}`).field(validClaim).attach('receipt', pdf, { filename: 'receipt.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(201);
    expect(mocks.claimUpdate).not.toHaveBeenCalled();
    finish({ summary: 'Motor issue', category: 'Mechanical', priority: 'MEDIUM', suggestedAction: 'Inspect motor' });
    await vi.waitFor(() => expect(mocks.claimUpdate).toHaveBeenCalledWith(claim._id, { $set: { aiAnalysis: expect.objectContaining({ priority: 'MEDIUM' }), aiStatus: 'COMPLETED' } }));
  });
  it('paginates and filters customer claims on the server', async () => {
    const limit = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    mocks.claimFind.mockReturnValue({ sort });
    const response = await request(app).get('/api/claims/my?page=2&limit=5&search=kettle&status=SUBMITTED').set('Authorization', `Bearer ${customerToken}`);
    expect(response.status).toBe(200);
    expect(skip).toHaveBeenCalledWith(5);
    expect(mocks.claimFind.mock.calls[0][0].status).toBe('SUBMITTED');
    expect(response.body.pagination.page).toBe(2);
  });
  it('allows the admin to advance status and keeps history', async () => {
    const claim = { status: 'SUBMITTED', statusHistory: [], save: vi.fn().mockResolvedValue(undefined), populate: vi.fn().mockResolvedValue(undefined) };
    mocks.claimFindById.mockResolvedValue(claim);
    const response = await request(app).patch('/api/admin/claims/507f1f77bcf86cd799439014').set('Authorization', `Bearer ${adminToken}`).send({ status: 'UNDER_REVIEW', adminNote: 'Checking the receipt' });
    expect(response.status).toBe(200);
    expect(claim.statusHistory).toHaveLength(1);
    expect(claim.status).toBe('UNDER_REVIEW');
  });
  it('lets an admin retry an existing claim without waiting for Gemini', async () => {
    mocks.claimRetry.mockResolvedValue({ _id: '507f1f77bcf86cd799439014', productName: 'Electric kettle', productCategory: 'Kitchen Appliance', issueDescription: 'The kettle stopped heating water.', aiStatus: 'PENDING' });
    let finish!: (value: unknown) => void;
    mocks.analysis.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const response = await request(app).post('/api/admin/claims/507f1f77bcf86cd799439014/analysis').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(202);
    expect(response.body.data.aiStatus).toBe('PENDING');
    expect(mocks.claimUpdate).not.toHaveBeenCalled();
    finish({ summary: 'Motor issue', category: 'Mechanical', priority: 'MEDIUM', suggestedAction: 'Inspect motor' });
    await vi.waitFor(() => expect(mocks.claimUpdate).toHaveBeenCalledWith('507f1f77bcf86cd799439014', { $set: { aiAnalysis: expect.objectContaining({ priority: 'MEDIUM' }), aiStatus: 'COMPLETED' } }));
  });
  it('does not retry an active or completed assessment', async () => {
    mocks.claimRetry.mockResolvedValue(null);
    const response = await request(app).post('/api/admin/claims/507f1f77bcf86cd799439014/analysis').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(409);
    expect(mocks.analysis).not.toHaveBeenCalled();
  });
});
