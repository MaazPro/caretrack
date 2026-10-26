import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { Claim } from '../src/models/Claim.js';

const customerId = new mongoose.Types.ObjectId();
const baseClaim = () => ({
  claimNumber: 'CT-2026-TEST', customerId, productName: 'Electric kettle',
  productCategory: 'Kitchen Appliance', purchaseDate: new Date('2025-01-02'),
  issueDescription: 'The kettle stopped heating water.', receiptId: new mongoose.Types.ObjectId(),
  status: 'SUBMITTED', statusHistory: [{ status: 'SUBMITTED', changedAt: new Date(), changedBy: customerId }],
});

describe('claim reimbursement schema', () => {
  it('validates a new claim without reimbursement fields', async () => {
    const claim = new Claim(baseClaim());
    await expect(claim.validate()).resolves.toBeUndefined();
    expect(claim.reimbursement).toBeUndefined();
    expect(claim.toObject()).not.toHaveProperty('reimbursement');
  });

  it('validates issued voucher fields when reimbursement is present', async () => {
    const claim = new Claim({ ...baseClaim(), reimbursement: { amountMinor: 125000, currency: 'PKR', voucherCode: 'CTP-ABCD-1234-EF56-7890', pickupAddress: 'CareTrack Demo Collection Desk', status: 'READY_FOR_COLLECTION', issuedAt: new Date(), issuedBy: customerId } });
    await expect(claim.validate()).resolves.toBeUndefined();
  });

  it('rejects incomplete reimbursement data', async () => {
    const claim = new Claim({ ...baseClaim(), reimbursement: { status: 'READY_FOR_COLLECTION' } });
    await expect(claim.validate()).rejects.toMatchObject({ name: 'ValidationError' });
  });
});
