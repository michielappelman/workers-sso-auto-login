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
		const sessionCookie = `${config.sessionCookie}=`;
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

			// If autoLogin is enabled, directly submit the form instead of serving the login page
			if (config.autoLogin) {
				// Create form data with the credentials
				const formData = new URLSearchParams();
				formData.append(config.usernameField, creds.legacyUsername);
				formData.append(config.passwordField, creds.legacyPassword);

				// Submit the form directly
				const loginRequest = new Request(request.url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'User-Agent': request.headers.get('User-Agent') || '',
						Cookie: request.headers.get('Cookie') || '',
						Accept: request.headers.get('Accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
						Referer: request.url,
					},
					body: formData,
					redirect: 'manual',
				});

				const loginResponse = await fetch(loginRequest);

				// If login was successful (status < 400), serve the response with session cookie
				if (loginResponse.status < 400) {
					const newHeaders = new Headers(loginResponse.headers);
					const setCookie = loginResponse.headers.get('set-cookie');
					if (setCookie) {
						newHeaders.set('set-cookie', setCookie);
					}

					return new Response(loginResponse.body, {
						status: loginResponse.status,
						headers: newHeaders,
					});
				}

				// If login failed, return the login response as-is
				return loginResponse;
			}

			// For non-autoLogin, serve the login page with JavaScript injection
			const originResp = await fetch(request);
			const passwordToken = generatePasswordToken(accessEmail);
			let html = await originResp.text();

			html = html.replace(
				'</body>',
				`<script>
        window.addEventListener('DOMContentLoaded', () => {
          document.querySelector('input[name="${config.usernameField}"]').value = "${creds.legacyUsername}";
          document.querySelector('input[name="${config.passwordField}"]').value = "${passwordToken}";
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
	const allCredentials = await db
		.select()
		.from(userCredentials)
		.where(eq(userCredentials.appHostname, appHostname))
		.all();
	
	const matchingCredentials = allCredentials
		.filter(cred => matchesEmailPattern(cred.accessEmail, accessEmail))
		.sort((a, b) => getPatternSpecificity(b.accessEmail) - getPatternSpecificity(a.accessEmail));
	
	return matchingCredentials.length > 0 ? matchingCredentials[0] : null;
}

export function matchesEmailPattern(pattern: string, email: string): boolean {
	if (pattern === email) {
		return true;
	}
	
	if (pattern === '*') {
		return true;
	}
	
	const regexPattern = pattern
		.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*');
	
	const regex = new RegExp(`^${regexPattern}$`, 'i');
	return regex.test(email);
}

export function getPatternSpecificity(pattern: string): number {
	if (pattern === '*') {
		return 0;
	}
	
	const wildcardCount = (pattern.match(/\*/g) || []).length;
	const baseScore = pattern.length;
	
	return baseScore - (wildcardCount * 10);
}

// Helper: Generate temporary password token
function generatePasswordToken(email: string): string {
	const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
	return `${email}_${date}`;
}
