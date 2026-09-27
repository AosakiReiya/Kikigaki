import { defineConfig } from 'drizzle-kit';

// dbCredentials is only needed by commands that connect to remote D1 (db:push / db:migrate / db:studio).
// `db:generate` only reads the schema and needs no credentials — defer the error until something's actually missing.
const requireCredentials = () => {
	if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
	if (!process.env.CLOUDFLARE_DATABASE_ID) throw new Error('CLOUDFLARE_DATABASE_ID is not set');
	if (!process.env.CLOUDFLARE_D1_TOKEN) throw new Error('CLOUDFLARE_D1_TOKEN is not set');

	return {
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
		databaseId: process.env.CLOUDFLARE_DATABASE_ID,
		token: process.env.CLOUDFLARE_D1_TOKEN
	};
};

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './migrations',
	dialect: 'sqlite',
	driver: 'd1-http',
	get dbCredentials() {
		return requireCredentials();
	},
	verbose: true,
	strict: true
});
