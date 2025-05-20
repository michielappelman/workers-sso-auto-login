# Cloudflare Worker SSO Credential Injector

**This Worker lets you retrofit SSO onto legacy web apps—no code changes required on the app itself.**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmichielappelman%2Fworkers-sso-auto-login)

## Overview

This Worker enables seamless Single Sign-On (SSO) for legacy web applications that do not natively support SSO or Cloudflare Access. It bridges Cloudflare Access authentication with legacy username/password logins by automatically mapping Access-authenticated users to their legacy credentials and transparently submitting the login form on their behalf.

Suppose you have a self-hosted application that only supports traditional username/password authentication. You want to protect it with Cloudflare Access and give users a true SSO experience, without requiring them to manually enter their legacy credentials.

Even better, the user trying to log in, will not need to know, or will be able to see the password they are loggin in with!

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

## Potential customization

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

Create a D1 database (if not done by the Deploy button above).

```sh
$ npx wrangler d1 create auto-login-worker
```

Install [Drizzle ORM](https://orm.drizzle.team) as a dependency:

```sh
npm install drizzle-orm
```

Generate a migration based on the schema:

```sh
npx drizzle-kit generate:sqlite --schema=./src/schema.ts --out=./migrations
```

Apply the migration:

```sh
npx wrangler d1 migrations apply auto-login-worker
```

Insert mappings for your users by visiting the [Cloudflare D1](https://dash.cloudflare.com/?to=/:account/workers/d1) section of the dashboard and the created D1 database and table.

### 3. Deploy the Worker

Configure the required environment variables in your `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "auto-login-worker",
      "database_id": "example-id"
    }
  ],
  "vars": {
    "LOGIN_PATH": "/login",
    "SESSION_COOKIE": "app-session",
  }
}
```

Add the route for an application (you can make this more specific to the login path if you want):

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
- Ensure the Access policy includes the `cf-access-authenticated-user-email` header.

### 5. Test the Integration

- Visit your application’s login page.
- You should be auto-logged in as the mapped legacy user, without needing to enter credentials.

## Security Notes

- Store legacy passwords securely in D1.
- Note that the temporary password will be available in plaintext in the HTML of the intercepted page. It cannot be used to log in to any application, but is matched on as a 'placeholder' to replace with the real password to the origin.
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
