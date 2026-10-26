import mongoose, { Schema } from 'mongoose';

export const roles = ['CUSTOMER', 'ADMIN'] as const;
export type Role = typeof roles[number];

export interface UserDocument extends mongoose.Document {
  fullName: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, default: 'CUSTOMER', required: true },
}, { timestamps: true });

export const User = mongoose.model<UserDocument>('User', userSchema);
