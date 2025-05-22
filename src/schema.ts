import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Define the user_credentials table schema
export const userCredentials = sqliteTable('user_credentials', {
	accessEmail: text('access_email').notNull(),
	appHostname: text('app_hostname')
		.references(() => appConfig.hostname)
		.notNull(), // Foreign key pointing to the app_config table
	legacyUsername: text('legacy_username').notNull(),
	legacyPassword: text('legacy_password').notNull(),
});

// Define type for the credentials to be used in the application
export type LegacyCredentials = {
	legacyUsername: string;
	legacyPassword: string;
};

// Define the app_config table schema
export const appConfig = sqliteTable('app_config', {
	hostname: text('hostname').primaryKey(), // Hostname as primary key
	loginPath: text('login_path').notNull(),
	usernameField: text('username_field').notNull(),
	passwordField: text('password_field').notNull(),
	sessionCookie: text('session_cookie').notNull(),
	autoLogin: integer('auto_login', { mode: 'boolean' }).default(true).notNull(),
});

// Define type for the app configuration to be used in the application
export type AppConfig = {
	hostname: string;
	loginPath: string;
	usernameField: string;
	passwordField: string;
	sessionCookie: string;
	autoLogin: boolean;
};
