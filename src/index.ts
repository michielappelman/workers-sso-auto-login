/**
 * Cloudflare Worker for credential injection and legacy authentication proxying.
 *
 * Functionality:
 * - Intercepts requests to the legacy application's login page.
 * - Auto-fills the login form with a mapped legacy username and a temporary password token for users authenticated via Cloudflare Access.
 * - On login form POST, replaces the temporary password token with the actual legacy password (looked up from a D1 database) and proxies the login request to the origin.
 * - Preserves all other form fields and essential headers.
 * - Forwards Set-Cookie headers from the origin to the client to maintain session state.
 * - Proxies all other requests transparently, except when a valid session cookie is present (in which case it bypasses credential injection).
 *
 * Environment Bindings:
 * - DB: D1Database (Cloudflare D1 binding for credential lookup)
 * - LOGIN_PATH: string (URI of the login form)
 * - SESSION_COOKIE: string (name of the session cookie set by the legacy app, e.g., "SonarrAuth")
 * - PASSWORD_TOKEN: string (unique token value used as a placeholder in the login form password field)
 *
 * D1 Database Schema:
 *   CREATE TABLE user_credentials (
 *     access_email TEXT PRIMARY KEY,         -- Email address from Cloudflare Access
 *     legacy_username TEXT NOT NULL,         -- Username for the legacy application
 *     legacy_password TEXT NOT NULL          -- Password for the legacy application
 *   );
 *
 * Usage:
 * - Populate the D1 table with mappings from Access email addresses to legacy usernames and passwords.
 * - Configure the LOGIN_PATH, SESSION_COOKIE and PASSWORD_TOKEN bindings in your Worker environment.
 * - Deploy the Worker in front of your legacy application to enable seamless SSO for users authenticated via Cloudflare Access.
 */

export interface Env {
	DB: D1Database;
	LOGIN_PATH: string;
	SESSION_COOKIE: string;
	PASSWORD_TOKEN: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 1. If session cookie is present, proxy request directly
		const cookieHeader = request.headers.get('cookie') || '';
		if (cookieHeader.includes(`${env.SESSION_COOKIE}=`)) {
			return fetch(request);
		}

		// 2. Intercept login page to inject JS/token
		if (url.pathname === env.LOGIN_PATH && request.method === 'GET') {
			const accessEmail = getUserEmail(request);
			const creds = await getLegacyCredentials(env.DB, accessEmail);
			const legacy_username = creds?.legacy_username || '';
			const originResp = await fetch(request);
			let html = await originResp.text();

			html = html.replace(
				'</body>',
				`<script>
        window.addEventListener('DOMContentLoaded', () => {
          document.querySelector('input[name="username"]').value = "${legacy_username}";
          document.querySelector('input[name="password"]').value = "${env.PASSWORD_TOKEN}";
          document.querySelector('form').submit();
        });
        </script></body>`,
			);

			return new Response(html, {
				status: originResp.status,
				headers: originResp.headers,
			});
		}

		// 3. Handle login POST requests and replace token password with real password
		if (url.pathname === env.LOGIN_PATH && request.method === 'POST') {
			const contentType = request.headers.get('content-type') || '';
			if (contentType.includes('application/x-www-form-urlencoded')) {
				const formData = await request.clone().formData();
				if (formData.get('password') === env.PASSWORD_TOKEN) {
					const accessEmail = getUserEmail(request);
					const creds = await getLegacyCredentials(env.DB, accessEmail);
					if (!creds) {
						return new Response('Unauthorized', { status: 401 });
					}
					formData.set('username', creds.legacy_username);
					formData.set('password', creds.legacy_password);

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

		// 4. Proxy all other requests
		return fetch(request);
	},
} satisfies ExportedHandler<Env>;

// Helper: Extract user email from Access headers
function getUserEmail(request: Request): string {
	return request.headers.get('cf-access-authenticated-user-email') || 'unknown@example.com';
}

// Helper: Lookup legacy credentials from D1
async function getLegacyCredentials(
	db: D1Database,
	accessEmail: string,
): Promise<{ legacy_username: string; legacy_password: string } | null> {
	const stmt = db.prepare('SELECT legacy_username, legacy_password FROM user_credentials WHERE access_email = ?');
	const result = await stmt.bind(accessEmail).first();
	if (result && result.legacy_username && result.legacy_password) {
		return { legacy_username: result.legacy_username, legacy_password: result.legacy_password };
	}
	return null;
}
