import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { Reimbursement } from '../models/Claim.js';

export function newVoucherCode() {
  return `CTP-${randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g)!.join('-')}`;
}

export function voucherCodeMatches(expected: string, supplied: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function formatReimbursement(amountMinor: number, currency: Reimbursement['currency']) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amountMinor / 100);
}

const pdfText = (value: string) => value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '?');
function linesFor(font: PDFFont, value: string, maxWidth: number, size: number) {
  const lines: string[] = [];
  let current = '';
  for (const word of pdfText(value).split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

export async function createPickupVoucherPdf(input: { claimNumber: string; customerName: string; productName: string; reimbursement: Reimbursement }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);
  const ink = rgb(0.12, 0.16, 0.22);
  const muted = rgb(0.4, 0.45, 0.51);
  const blue = rgb(0.086, 0.467, 1);
  page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: blue });
  page.drawText('CareTrack', { x: 44, y: 802, size: 23, font: bold, color: rgb(1, 1, 1) });
  page.drawText('REIMBURSEMENT PICKUP VOUCHER', { x: 44, y: 740, size: 18, font: bold, color: ink });
  page.drawText('Demo document - not proof that payment has been made', { x: 44, y: 716, size: 10, font: regular, color: muted });
  page.drawLine({ start: { x: 44, y: 696 }, end: { x: 551, y: 696 }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });

  let y = 666;
  const row = (label: string, value: string) => {
    page.drawText(label, { x: 44, y, size: 10, font: bold, color: muted });
    const lines = linesFor(regular, value, 337, 11);
    for (const [index, line] of lines.entries()) page.drawText(line, { x: 214, y: y - index * 16, size: 11, font: regular, color: ink });
    y -= Math.max(28, lines.length * 16 + 10);
  };
  row('Claim number', input.claimNumber);
  row('Customer', input.customerName);
  row('Product', input.productName);
  row('Amount authorized', formatReimbursement(input.reimbursement.amountMinor, input.reimbursement.currency));
  row('Issued on', input.reimbursement.issuedAt.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }));
  row('Pickup address (mock)', input.reimbursement.pickupAddress);

  y -= 8;
  page.drawText('VERIFICATION CODE', { x: 44, y, size: 10, font: bold, color: muted });
  y -= 28;
  page.drawText(input.reimbursement.voucherCode, { x: 44, y, size: 18, font: mono, color: blue });
  y -= 42;
  page.drawText('Bring this voucher and your original purchase receipt.', { x: 44, y, size: 11, font: bold, color: ink });
  y -= 20;
  for (const line of linesFor(regular, 'Staff will verify the code and original receipt in CareTrack before recording collection.', 500, 10)) {
    page.drawText(line, { x: 44, y, size: 10, font: regular, color: muted }); y -= 16;
  }
  page.drawLine({ start: { x: 44, y: 112 }, end: { x: 551, y: 112 }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });
  page.drawText('DEMO ONLY - The address is fictional. CareTrack does not transfer funds.', { x: 44, y: 90, size: 9, font: bold, color: muted });
  page.drawText('This voucher authorizes collection; it is not a payment receipt.', { x: 44, y: 74, size: 9, font: regular, color: muted });
  return Buffer.from(await pdf.save());
}
