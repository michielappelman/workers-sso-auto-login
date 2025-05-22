import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { Layout, ApplicationTable, ApplicationForm, UserTable, UserForm } from './html';
import { userCredentials, appConfig, type LegacyCredentials, type AppConfig } from '../schema';

export interface Env {
	DB: D1Database;
}

const admin = new Hono<{ Bindings: Env }>();

// Middleware for basic authentication check
admin.use('*', async (c, next) => {
	const authHeader = c.req.header('cf-access-authenticated-user-email');
	if (!authHeader) {
		return c.text('Unauthorized', 401);
	}
	await next();
});

// Dashboard / Applications List
admin.get('/', async (c) => {
	const db = drizzle(c.env.DB);
	const apps = await db.select().from(appConfig).all();

	// Count users for each application
	const appStats = await Promise.all(
		apps.map(async (app) => {
			const userCount = await db
				.select({ count: userCredentials.accessEmail })
				.from(userCredentials)
				.where(eq(userCredentials.appHostname, app.hostname))
				.all();

			return {
				...app,
				userCount: userCount.length,
			};
		}),
	);

	return c.html(
		Layout({
			title: 'SSO Admin Portal',
			children: html`
				<h1 class="mb-4">Applications</h1>

				${ApplicationTable({ apps: appStats })}

				<h2 class="mb-3 mt-5">Add New Application</h2>
				${ApplicationForm({
					action: '/apps/new',
					submitLabel: 'Add Application',
					app: {},
				})}
			`,
		}),
	);
});

// Handle new application creation
admin.post('/apps/new', async (c) => {
	try {
		const db = drizzle(c.env.DB);
		const formData = await c.req.formData();

		const hostname = formData.get('hostname') as string;
		const loginPath = formData.get('loginPath') as string;
		const usernameField = formData.get('usernameField') as string;
		const passwordField = formData.get('passwordField') as string;
		const sessionCookie = formData.get('sessionCookie') as string;
		const autoLogin = formData.has('autoLogin'); // Checkbox: present when checked

		if (!hostname || !loginPath || !usernameField || !passwordField || !sessionCookie) {
			return c.text('All fields are required', 400);
		}

		await db.insert(appConfig).values({
			hostname,
			loginPath,
			usernameField,
			passwordField,
			sessionCookie,
			autoLogin,
		});

		return c.redirect('/');
	} catch (error) {
		return c.text(`Error: ${error instanceof Error ? error.message : String(error)}`, 500);
	}
});

// Application management page (config + users)
admin.get('/apps/:hostname', async (c) => {
	try {
		const db = drizzle(c.env.DB);
		const hostname = c.req.param('hostname');

		// Get application config
		const apps = await db.select().from(appConfig).where(eq(appConfig.hostname, hostname)).limit(1);
		if (apps.length === 0) {
			return c.text('Application not found', 404);
		}
		const app = apps[0];

		// Get users for this application
		const users = await db.select().from(userCredentials).where(eq(userCredentials.appHostname, hostname)).all();

		return c.html(
			Layout({
				title: `Manage Application - ${app.hostname}`,
				children: html`
					<h1 class="mb-3">Manage Application: ${app.hostname}</h1>
					<a href="/" class="btn btn-outline-secondary mb-4">&larr; Back to Applications</a>

					<div class="section">
						<h2 class="mb-3">Application Configuration</h2>
						${ApplicationForm({
							action: `/apps/${hostname}/update`,
							submitLabel: 'Update Configuration',
							app: app,
							showHostname: false,
						})}
					</div>

					<hr class="my-4" />

					<div class="section">
						<h2 class="mb-3">User Credentials</h2>
						${UserTable({ users, hostname })} ${UserForm({ hostname })}
					</div>
				`,
			}),
		);
	} catch (error) {
		return c.text(`Error: ${error instanceof Error ? error.message : String(error)}`, 500);
	}
});

// Update application configuration
admin.post('/apps/:hostname/update', async (c) => {
	try {
		const db = drizzle(c.env.DB);
		const hostname = c.req.param('hostname');
		const formData = await c.req.formData();

		const loginPath = formData.get('loginPath') as string;
		const usernameField = formData.get('usernameField') as string;
		const passwordField = formData.get('passwordField') as string;
		const sessionCookie = formData.get('sessionCookie') as string;
		const autoLogin = formData.has('autoLogin'); // Checkbox: present when checked

		if (!loginPath || !usernameField || !passwordField || !sessionCookie) {
			return c.text('All fields are required', 400);
		}

		await db
			.update(appConfig)
			.set({
				loginPath,
				usernameField,
				passwordField,
				sessionCookie,
				autoLogin,
			})
			.where(eq(appConfig.hostname, hostname));

		return c.redirect(`/apps/${hostname}`);
	} catch (error) {
		return c.text(`Error: ${error instanceof Error ? error.message : String(error)}`, 500);
	}
});

// Add new user to an application
admin.post('/apps/:hostname/users/new', async (c) => {
	try {
		const db = drizzle(c.env.DB);
		const hostname = c.req.param('hostname');
		const formData = await c.req.formData();

		const accessEmail = formData.get('accessEmail') as string;
		const legacyUsername = formData.get('legacyUsername') as string;
		const legacyPassword = formData.get('legacyPassword') as string;

		if (!accessEmail || !legacyUsername || !legacyPassword) {
			return c.text('All fields are required', 400);
		}

		// Check if application exists
		const appExists = await db.select().from(appConfig).where(eq(appConfig.hostname, hostname)).limit(1);

		if (appExists.length === 0) {
			return c.text('Application not found', 404);
		}

		await db.insert(userCredentials).values({
			accessEmail,
			appHostname: hostname,
			legacyUsername,
			legacyPassword,
		});

		return c.redirect(`/apps/${hostname}`);
	} catch (error) {
		return c.text(`Error: ${error instanceof Error ? error.message : String(error)}`, 500);
	}
});

// Delete user from an application
admin.post('/apps/:hostname/users/:email/delete', async (c) => {
	try {
		const db = drizzle(c.env.DB);
		const hostname = c.req.param('hostname');
		const email = decodeURIComponent(c.req.param('email'));

		await db.delete(userCredentials).where(and(eq(userCredentials.accessEmail, email), eq(userCredentials.appHostname, hostname)));

		return c.redirect(`/apps/${hostname}`);
	} catch (error) {
		return c.text(`Error: ${error instanceof Error ? error.message : String(error)}`, 500);
	}
});

// Export the Hono app for handling admin requests
export async function handleAdminRequest(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
	return admin.fetch(request, env, ctx);
}
