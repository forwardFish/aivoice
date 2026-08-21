import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://aivoice:aivoice_local@127.0.0.1:54329/aivoice',
  },
  strict: true,
  verbose: true,
});
