import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { userCredentials, appConfig, type LegacyCredentials, type AppConfig } from './schema';
import { handleAdminRequest } from './admin/admin';

export interface Env {
	DB: D1Database;
	ADMIN_HOSTNAME: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Check if request is for admin portal
		if (url.hostname === env.ADMIN_HOSTNAME) {
			return handleAdminRequest(request, env);
		}

		// Retrieve configuration from database
		const db = drizzle(env.DB);
		const configArray = await db.select().from(appConfig).where(eq(appConfig.hostname, url.hostname)).limit(1);
		const config = configArray[0];

		// Proxy directly if no configuration found
		if (!config) {
			return fetch(request);
		}

		// If the configured session cookie is present, proxy request directly
		const cookieHeader = request.headers.get('cookie') || '';
		const sessionCookie = `session=${config.sessionCookie}`;
		if (cookieHeader.includes(sessionCookie)) {
			return fetch(request);
		}

		if (url.pathname === config.loginPath && request.method === 'GET') {
			const accessEmail = getUserEmail(request);
			const creds = await getLegacyCredentials(db, config.hostname, accessEmail);
			// If there are no credentials, proxy directly so user can log in with their own credentials.
			if (!creds) {
				return fetch(request);
			}

			const originResp = await fetch(request);
			const passwordToken = generatePasswordToken(accessEmail);
			let html = await originResp.text();

			// Add JavaScript code to automatically submit if autoLogin is enabled
			const autoSubmitJavaScript = config.autoLogin ? `document.querySelector('form').submit();` : '';

			html = html.replace(
				'</body>',
				`<script>
        window.addEventListener('DOMContentLoaded', () => {
          document.querySelector('input[name="${config.usernameField}"]').value = "${creds.legacyUsername}";
          document.querySelector('input[name="${config.passwordField}"]').value = "${passwordToken}";
          ${autoSubmitJavaScript}
        });
        </script></body>`,
			);

			return new Response(html, {
				status: originResp.status,
				headers: originResp.headers,
			});
		}

		// Handle login POST requests and replace token password with real password
		if (url.pathname === config.loginPath && request.method === 'POST') {
			const contentType = request.headers.get('content-type') || '';
			if (contentType.includes('application/x-www-form-urlencoded')) {
				const formData = await request.clone().formData();
				const accessEmail = getUserEmail(request);
				const passwordToken = generatePasswordToken(accessEmail);

				if (formData.get(config.passwordField) === passwordToken) {
					const db = drizzle(env.DB);
					const creds = await getLegacyCredentials(db, config.hostname, accessEmail);
					// If there are no credentials, block the request
					if (!creds) {
						return new Response('Unauthorized - No credentials found for this user', {
							status: 401,
							headers: {
								'Content-Type': 'text/plain',
							},
						});
					}

					formData.set(config.usernameField, creds.legacyUsername);
					formData.set(config.passwordField, creds.legacyPassword);

					const newBody = new URLSearchParams();
					for (const [k, v] of formData.entries()) newBody.append(k, v as string);

					// Copy headers except content-length and host
					const headers = new Headers(request.headers);
					headers.delete('content-length');
					headers.delete('host');
					headers.set('content-type', 'application/x-www-form-urlencoded');

					const newReq = new Request(request.url, {
						method: 'POST',
						headers,
						body: newBody,
					});
					const resp = await fetch(newReq, { redirect: 'manual' });

					// Copy all headers, especially Set-Cookie
					const newHeaders = new Headers(resp.headers);
					const setCookie = resp.headers.get('set-cookie');
					if (setCookie) {
						newHeaders.set('set-cookie', setCookie);
					}

					return new Response(resp.body, {
						status: resp.status,
						headers: newHeaders,
					});
				}
			}
		}

		// Proxy all other requests
		return fetch(request);
	},
} satisfies ExportedHandler<Env>;

// Helper: Extract user email from Access headers
function getUserEmail(request: Request): string {
	return request.headers.get('cf-access-authenticated-user-email') || 'unknown@example.com';
}

// Helper: Lookup legacy credentials from D1 using Drizzle ORM
async function getLegacyCredentials(
	db: ReturnType<typeof drizzle>,
	appHostname: string,
	accessEmail: string,
): Promise<LegacyCredentials | null> {
	const results = await db
		.select()
		.from(userCredentials)
		.where(and(eq(userCredentials.appHostname, appHostname), eq(userCredentials.accessEmail, accessEmail)))
		.all();
	if (results.length > 0) {
		return results[0];
	}
	return null;
}

// Helper: Generate temporary password token
function generatePasswordToken(email: string): string {
	const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
	return `${email}_${date}`;
}
