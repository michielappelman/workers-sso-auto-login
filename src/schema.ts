import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Define the user_credentials table schema
export const userCredentials = sqliteTable('user_credentials', {
	accessEmail: text('access_email').primaryKey(),
	legacyUsername: text('legacy_username').notNull(),
	legacyPassword: text('legacy_password').notNull(),
});

// Define type for the credentials to be used in the application
export type LegacyCredentials = {
	legacyUsername: string;
	legacyPassword: string;
};
