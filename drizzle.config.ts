import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url:
            process.env.DATABASE_URL ??
            'postgres://better_budget:better_budget@localhost:5432/better_budget'
    },
    strict: true,
    verbose: true
});
