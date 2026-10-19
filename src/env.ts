import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			"The database: a local file (`file:local.db`) or a Turso database (`libsql://<name>.turso.io`). Not on Cloudflare, where the database is the app's Durable Object's (`cloudflare/entry.ts`).",
		schema: (value) => value || undefined,
	},
	DATABASE_AUTH_TOKEN: {
		description: "Optional. The access token of a Turso database; a local file needs none.",
		schema: (value) => value || undefined,
	},
	ORIGIN: {
		description:
			"The app origin (base URL), e.g. `http://localhost:5173`. Optional on Vercel, which sets `VERCEL_BRANCH_URL`.",
		schema: (value) => value || undefined,
	},
	VERCEL_BRANCH_URL: {
		description:
			"Set by Vercel: the deployment's branch domain, without `https://`. The origin when `ORIGIN` isn't set.",
		schema: (value) => value || undefined,
	},
	BETTER_AUTH_SECRET: {
		description:
			"Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).",
	},
	SMTP_URL: {
		description:
			"Optional. Where to send mail, e.g. `smtp://user:password@smtp.example.com:587` (STARTTLS; on Cloudflare only that works, not `smtps://` on port 465). Without it, mail (such as invitations) is logged to the server console.",
		schema: (value) => value || undefined,
	},
	MAIL_FROM: {
		description: "Optional. The sender of the app's mail, e.g. `Fieldworks <noreply@example.com>`.",
		schema: (value) => value || "Fieldworks <noreply@fieldworks.example>",
	},
	MAIL_OUTBOX: {
		description:
			"Optional, for tests. A file that mail is appended to (one JSON object per line) instead of being sent or logged.",
		schema: (value) => value || undefined,
	},
	CRON_SECRET: {
		description:
			"Optional. The token a cron sends (`Authorization: Bearer <token>`) to start the daily jobs at `/_ops/daily`, e.g. Vercel Cron's own. Without it (or `OPS_TOKEN`), nothing can start them.",
		schema: (value) => value || undefined,
	},
	OPS_TOKEN: {
		description:
			"Optional. The operations token: on Cloudflare it guards `/_ops/import` and starts the daily jobs (the Cron Trigger, `cloudflare/entry.ts`); `/_ops/daily` takes it as well as `CRON_SECRET`.",
		schema: (value) => value || undefined,
	},
	DEMO_SIGN_IN: {
		description:
			"Optional, for local development and staging only, never in production. `true` shows the login page's demo buttons, which sign in as SHLTR's demo users without a password, and the user menus' 'View as' in SHLTR, which switches between them (`src/routes/demo.remote.ts`); anything else, or unset, hides them and refuses their sign-in.",
		schema: (value) => value === "true",
	},
	BUG_REPORT_EMAIL: {
		description:
			"Optional. Who gets an email for each bug report a user records (the record button in the headers), with a link to its replay page. Without it, the mail is logged to the server console instead.",
		schema: (value) => value || undefined,
	},
	DEVELOPER_EMAILS: {
		description:
			"Optional. The developers, by their accounts' email addresses, comma-separated: only they may open the bug reports' pages (`/ops/bug-reports`), which are a 404 for everyone else. Without it, no one may.",
		schema: (value) =>
			(value ?? "")
				.split(",")
				.map((email) => email.trim().toLowerCase())
				.filter(Boolean),
	},
	BUG_REPORTS_DIR: {
		description:
			"Optional, not on Cloudflare (whose bug reports go to the `BUG_REPORTS` R2 bucket). The folder the recorded bug reports are stored in; `.bug-reports` by default.",
		schema: (value) => value || ".bug-reports",
	},
	TIMING_LOGS: {
		description:
			"Optional. `1` logs a `timing` line per request (its time, transactions and statements) and per live query when it closes, as JSON (`src/lib/server/logs/timing.ts`). On in staging (`wrangler.jsonc`), off unless set.",
		schema: (value) => value === "1",
	},
	DEV_REMOTE_DELAY_MS: {
		description:
			"Optional, in development only. Milliseconds to hold up each remote function call, to try navigations under a slow server.",
		schema: (value) => (value ? Number(value) : undefined),
	},
});
