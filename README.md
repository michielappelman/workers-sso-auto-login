# Cloudflare Worker SSO Credential Injector

**This Worker lets you retrofit SSO onto legacy web apps—no code changes required on the app itself.**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmichielappelman%2Fworkers-auto-login)

## Overview

This Worker enables seamless Single Sign-On (SSO) for legacy web applications that do not natively support SSO or Cloudflare Access. It bridges Cloudflare Access authentication with legacy username/password logins by automatically mapping Access-authenticated users to their legacy credentials and transparently submitting the login form on their behalf.

**Use Case:**
Suppose you have a self-hosted application that only supports traditional username/password authentication. You want to protect it with Cloudflare Access and give users a true SSO experience, without requiring them to manually enter their legacy credentials.

## How It Works

- When a user accesses the login page, the Worker:
  - Looks up the user’s Cloudflare Access email in a D1 database.
  - Auto-fills the login form with the mapped legacy username and a temporary password token.
  - Submits the form automatically.
- When the login form is `POST`ed:
  - If the password matches the temporary token, the Worker swaps it for the real legacy password from D1 and proxies the POST to the origin.
  - All other form fields are preserved.
  - The Worker ensures session cookies set by the origin are forwarded to the browser.
- All other requests are proxied transparently, unless a valid session cookie is already present.

## Example Application: ERP

Suppose you want to enable SSO for an ERP system (`erp.example.com`), which only supports local username/password logins.

This Worker assumes that the login form of this ERP system is available on the `erp.example.com/login` URL, but it also assumes that the form `POST`s to the same URI. This might be different for your application(s), so customization might be needed.

Additionally, the Worker assumes that the username form field is called `username`, and the password field `password`. Again, this might require some customization.

## Getting Started

### 1. Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- Your legacy app must be behind Cloudflare and protected by Access.

### 2. Prepare the D1 Database

Create a D1 database and a `user_credentials` table using the schema in `schema.sql`.

```sh
$ npx wrangler d1 create user-credentials
$ npx wrangler d1 execute user-credentials --remote --file=./schema.sql
```

Insert mappings for your users by visiting the [Cloudflare D1](https://dash.cloudflare.com/?to=/:account/workers/d1) section of the dashboard and the created D1 database.

### 3. Deploy the Worker

- Clone or copy the Worker script.
- Bind the following environment variables in your `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "user-credentials",
      "database_id": "example-id"
    }
  ],
  "vars": {
    "LOGIN_PATH": "/login",
    "SESSION_COOKIE": "app-session",
    "PASSWORD_TOKEN": "asdfasdf"
  }
}
```

Add the route for an application (you can make this more specific to the login paht if you want):

```jsonc
"routes": [
		{
			"pattern": "erp.example.com/*",
			"zone_name": "example.com",
		},
	],
```

Deploy the Worker:

```sh
npx wrangler deploy
```

### 4. Configure Cloudflare Access

- Protect your legacy app’s URL with Access.
- Ensure the Access policy includes the ```cf-access-authenticated-user-email``` header.

### 5. Test the Integration

- Visit your application’s login page.
- You should be auto-logged in as the mapped legacy user, without needing to enter credentials.

## Security Notes

- Store legacy passwords securely in D1.
- Use a long, unique `PASSWORD_TOKEN` but note that this will be available in plaintext in the HTML of the intercepted page. It cannot be used to log in to any application, but is matched on as a 'placeholder' to replace with the real password to the origin.
- Only deploy this Worker for applications where you control both the authentication mapping and the backend.

## Troubleshooting

- If login fails, check:
  - The D1 mapping for the user’s email.
  - The Worker logs for POST body and header mismatches.
- Compare network requests from manual and Worker-driven logins using browser dev tools.

## References

- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Extend SSO with Workers (Cloudflare Docs)](https://developers.cloudflare.com/cloudflare-one/tutorials/extend-sso-with-workers/)
