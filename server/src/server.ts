import mongoose from 'mongoose';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';

const env = getEnv();
mongoose.connect(env.MONGODB_URI).then(() => {
  createApp().listen(env.PORT, () => console.log(`CareTrack API listening on ${env.PORT}`));
}).catch(error => { console.error('Database connection failed', error); process.exitCode = 1; });
