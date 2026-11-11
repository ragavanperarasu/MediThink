import mongoose from 'mongoose';
import { env } from './env.js';

/** Hides the password in a connection string before it is logged. */
const redact = (uri) => uri.replace(/\/\/([^@/]+)@/, '//***@');

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log(`[db] connected to ${redact(env.MONGODB_URI)}`);
}
