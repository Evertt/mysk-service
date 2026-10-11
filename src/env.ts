import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			"The database: a local file (`file:local.db`) or a Turso database (`libsql://<name>.turso.io`).",
	},
	DATABASE_AUTH_TOKEN: {
		description: "Optional. The access token of a Turso database; a local file needs none.",
		schema: (value) => value || undefined,
	},
	ORIGIN: {
		description: "The app origin (base URL), e.g. `http://localhost:5173`.",
	},
	BETTER_AUTH_SECRET: {
		description:
			"Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).",
	},
	SMTP_URL: {
		description:
			"Optional. Where to send mail, e.g. `smtps://user:password@smtp.example.com:465`. Without it, mail (such as invitations) is logged to the server console.",
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
});
