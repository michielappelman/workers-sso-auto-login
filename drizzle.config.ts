import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './migrations',
	schema: './src/schema.ts',
	dialect: 'sqlite',
});
