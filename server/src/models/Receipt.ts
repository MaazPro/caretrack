import mongoose, { Schema } from 'mongoose';

export interface ReceiptDocument extends mongoose.Document {
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  data: Buffer;
}

const receiptSchema = new Schema<ReceiptDocument>({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  contentType: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

export const Receipt = mongoose.model<ReceiptDocument>('Receipt', receiptSchema);
