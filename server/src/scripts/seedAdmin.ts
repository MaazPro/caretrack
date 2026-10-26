import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { getEnv } from '../config/env.js';
import { User } from '../models/User.js';

async function main() {
  const { MONGODB_URI } = getEnv();
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 8 characters');
  await mongoose.connect(MONGODB_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (await User.exists({ email })) throw new Error('Admin email is already in use');
  await User.create({ fullName: ADMIN_NAME.trim(), email, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'ADMIN' });
  console.log(`Admin created: ${email}`);
  await mongoose.disconnect();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; mongoose.disconnect().catch(() => {}); });
