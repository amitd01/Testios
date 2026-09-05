import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — see .env.example');
}

// Serverless functions are recycled constantly, so cap the pool at one
// connection per instance and let Neon's pooler do the multiplexing.
const client = postgres(process.env.DATABASE_URL, { max: 1 });

export const db = drizzle(client, { schema });
