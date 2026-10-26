import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, type UserDocument } from '../models/User.js';
import { getEnv } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { loginSchema, registerSchema } from '../validators/schemas.js';
import { asyncRoute, HttpError } from '../utils/http.js';

export const authRouter = Router();
const publicUser = (user: UserDocument) => ({ id: String(user._id), fullName: user.fullName, email: user.email, role: user.role });
const tokenFor = (user: UserDocument) => jwt.sign({ role: user.role }, getEnv().JWT_SECRET, { subject: String(user._id), expiresIn: '1d' });

authRouter.post('/register', asyncRoute(async (req, res) => {
  const data = registerSchema.parse(req.body);
  if (await User.exists({ email: data.email })) throw new HttpError(409, 'Email is already registered');
  const user = await User.create({ fullName: data.fullName, email: data.email, passwordHash: await bcrypt.hash(data.password, 12), role: 'CUSTOMER' });
  res.status(201).json({ user: publicUser(user), token: tokenFor(user) });
}));

authRouter.post('/login', asyncRoute(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await User.findOne({ email: data.email }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) throw new HttpError(401, 'Invalid email or password');
  res.json({ user: publicUser(user), token: tokenFor(user) });
}));

authRouter.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.auth!.id);
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(user) });
}));
