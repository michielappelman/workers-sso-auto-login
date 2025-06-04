# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development server with live reload
npm run dev
# or
wrangler dev

# Run tests (Vitest with Cloudflare Workers pool)
npm test

# Run specific test file
npx vitest run test/wildcard-matching.spec.ts

# Apply database migrations to remote D1
npm run db:migrations:apply

# Deploy to production (applies migrations + deploys)
npm run deploy

# Generate TypeScript types from Wrangler
npm run cf-typegen

# TypeScript compilation check (no build needed for Workers)
npx tsc --noEmit
```

## Architecture Overview

This is a **Cloudflare Worker** that retrofits SSO onto legacy web applications without requiring code changes to the target apps. It acts as a transparent proxy that intercepts login requests and automatically injects stored credentials.

### Core Components

**Main Worker (`src/index.ts`)**
- Entry point that routes requests between admin portal and protected applications
- Implements credential lookup with wildcard pattern matching (`matchesEmailPattern`, `getPatternSpecificity`)
- Handles two modes: auto-login (seamless) and form pre-fill (user submits)
- Uses Cloudflare Access headers (`cf-access-authenticated-user-email`) for user identification

**Database Schema (`src/schema.ts`)**
- Uses Drizzle ORM with Cloudflare D1 SQLite database
- `appConfig` table: application configuration (hostname, login paths, form field names)
- `userCredentials` table: maps Access email patterns to legacy credentials
- Supports wildcard patterns (`*@domain.com`, `*`) with precedence-based matching

**Admin Portal (`src/admin/`)**
- Hono-based web interface for managing applications and user mappings
- `admin.ts`: REST endpoints for CRUD operations
- `html.ts`: JSX-like template components using Hono's html helper
- Protected by Cloudflare Access authentication

### Key Architectural Patterns

**Wildcard Credential Matching**
- Email patterns support `*` wildcards (e.g., `*@company.com`, `*`)
- Specificity scoring: exact matches > domain wildcards > universal wildcard
- `getLegacyCredentials()` fetches all app credentials and sorts by specificity

**Request Flow**
1. Check if request is for admin portal (hostname-based routing)
2. Lookup app configuration by hostname
3. If session cookie present, proxy directly (user already logged in)
4. For login paths: lookup user credentials and either auto-submit or pre-fill form
5. For POST requests: swap temporary tokens with real passwords before proxying

**Environment Configuration**
- `ADMIN_HOSTNAME`: hostname for admin portal access
- `DB`: D1 database binding configured in `wrangler.jsonc`
- Worker routes must be configured to intercept target application domains

## Database Migrations

Migrations are stored in `migrations/` and applied via Wrangler D1 commands. The initial schema creates the two core tables with foreign key relationships.

## Testing Strategy

Tests use `@cloudflare/vitest-pool-workers` to run in isolated Cloudflare Workers runtime. The wildcard matching functions are exported from `src/index.ts` to enable proper unit testing without code duplication.

## Deployment Notes

This worker requires proper Cloudflare setup:
- D1 database binding
- Worker routes configured for target application domains
- Cloudflare Access protecting both admin portal and target applications
- Environment variables configured in wrangler.jsonc or dashboard