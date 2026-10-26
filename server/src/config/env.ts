import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  PICKUP_ADDRESS: z.string().trim().min(10).max(200).default('CareTrack Demo Collection Desk, 123 Example Street, Sample City 00000'),
});

export function getEnv() {
  return envSchema.parse(process.env);
}
