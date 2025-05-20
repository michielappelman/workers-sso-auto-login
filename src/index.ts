import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { userCredentials, type LegacyCredentials } from './schema';

export interface Env {
	DB: D1Database;
	LOGIN_PATH: string;
	SESSION_COOKIE: string;
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
			const db = drizzle(env.DB);
			const creds = await getLegacyCredentials(db, accessEmail);
			// If there are no credentials, proxy directly so user can log in with their own credentials.
			if (!creds) {
				return fetch(request);
			}

			const originResp = await fetch(request);
			const passwordToken = generatePasswordToken(accessEmail);
			let html = await originResp.text();

			html = html.replace(
				'</body>',
				`<script>
        window.addEventListener('DOMContentLoaded', () => {
          document.querySelector('input[name="username"]').value = "${creds.legacyUsername}";
          document.querySelector('input[name="password"]').value = "${passwordToken}";
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
				const accessEmail = getUserEmail(request);
				const passwordToken = generatePasswordToken(accessEmail);
				if (formData.get('password') === passwordToken) {
					const db = drizzle(env.DB);
					const creds = await getLegacyCredentials(db, accessEmail);
					// If there are no credentials, proxy directly so user can log in with their own credentials.
					if (!creds) {
						return fetch(request);
					}

					formData.set('username', creds.legacyUsername);
					formData.set('password', creds.legacyPassword);

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

// Helper: Lookup legacy credentials from D1 using Drizzle ORM
async function getLegacyCredentials(db: ReturnType<typeof drizzle>, accessEmail: string): Promise<LegacyCredentials | null> {
	const results = await db
		.select({
			legacyUsername: userCredentials.legacyUsername,
			legacyPassword: userCredentials.legacyPassword,
		})
		.from(userCredentials)
		.where(eq(userCredentials.accessEmail, accessEmail))
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
