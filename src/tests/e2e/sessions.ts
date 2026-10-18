/**
 * Signing a browser in without the login form: a session row written into the lane's database and
 * its cookie, signed with the servers' secret, as better-auth makes them when someone signs in
 * (`auth.api.signInEmail`, see `#lib/server/auth/better-auth.ts`). A few milliseconds instead of a
 * visit to /login, a submit and a redirect, for every file and context that starts signed in; the
 * form itself is `auth.test.ts`'s. `global-setup.ts` checks, once a run, that a real sign-in makes
 * the same row and cookie (`checkSessions()`), so a change in better-auth fails the run up front.
 */
import { randomBytes } from "node:crypto";

import type { Client, InValue } from "@libsql/client";

/** better-auth's session cookie (its default prefix; no `__Secure-` over plain http). */
const SESSION_COOKIE = "better-auth.session_token";

/** How long better-auth's sessions last by default: 7 days. */
const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;

/** A random id as better-auth makes them (`generateId()`): 32 letters and digits. */
function randomId() {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	return [...randomBytes(32)].map((byte) => alphabet[byte % alphabet.length]).join("");
}

/**
 * A cookie's value as better-auth signs it (better-call's `signCookieValue`): the value, a dot and
 * its HMAC-SHA256 in base64, URL-encoded.
 */
async function signedValue(value: string, secret: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
	return encodeURIComponent(`${value}.${Buffer.from(signature).toString("base64")}`);
}

/** Runs a statement on the app's database and returns the rows of its `returning`. */
type Write = (sql: string, args: InValue[]) => Promise<Record<string, unknown>[]>;

/** `client`'s statements as a `Write`. */
const writeWith =
	(client: Client): Write =>
	async (sql, args) =>
		(await client.execute({ sql, args })).rows;

/** A session of the database's, with what its cookie needs. */
interface Session {
	token: string;
	expiresAt: Date;
	activeOrganizationId: string | null;
}

/** The columns `newSession()` writes, which `checkSessions()` holds a real sign-in's row to. */
const sessionColumns = [
	"id",
	"token",
	"user_id",
	"active_organization_id",
	"expires_at",
	"created_at",
	"updated_at",
	"ip_address",
	"user_agent",
];

/**
 * Starts a session for the user with `email` in the app's database, as signing in does: in the
 * organization they joined first (`initialOrganizationId` in `better-auth.ts`). Unlike a sign-in,
 * without their address and browser (`ip_address`, `user_agent`), which the app doesn't read.
 */
export async function newSession(write: Write, email: string): Promise<Session> {
	const now = Date.now();
	const expiresAt = now + SESSION_LIFETIME;
	const token = randomId();
	const rows = await write(
		`insert into session (${sessionColumns.join(", ")})
			select ?, ?, u.id,
				(select m.organization_id from member m where m.user_id = u.id
				 order by m.created_at limit 1),
				?, ?, ?, null, null
			from user u where u.email = ?
			returning active_organization_id`,
		[randomId(), token, expiresAt, now, now, email],
	);
	if (!rows.length) throw new Error(`There's no user ${email} to sign in.`);
	return {
		token,
		expiresAt: new Date(expiresAt),
		activeOrganizationId: rows[0].active_organization_id as string | null,
	};
}

/** The session's cookie for Playwright (`context.addCookies()`), as better-auth sets it. */
export async function sessionCookie(session: Session, baseURL: string, secret: string) {
	return {
		name: SESSION_COOKIE,
		value: await signedValue(session.token, secret),
		url: baseURL,
		httpOnly: true,
		sameSite: "Lax" as const,
		expires: Math.floor(session.expiresAt.getTime() / 1000),
	};
}

/**
 * Checks that `newSession()` and `sessionCookie()` still make what better-auth makes, against the
 * app at `baseURL` on `client`'s database: signs in for real through better-auth's endpoint (once:
 * it limits sign-ins to 3 per 10 s), compares the row and cookie it made with what these helpers
 * make, and has the app read a session of theirs. Removes both sessions again.
 */
export async function checkSessions(
	client: Client,
	baseURL: string,
	secret: string,
	email: string,
	password: string,
) {
	const fail: (what: string) => never = (what) => {
		throw new Error(
			`Signing in without the form (src/tests/e2e/sessions.ts) no longer matches better-auth: ${what}`,
		);
	};
	const response = await fetch(`${baseURL}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: baseURL },
		body: JSON.stringify({ email, password }),
	});
	if (!response.ok) fail(`the sign-in answered ${response.status}: ${await response.text()}`);
	const cookie = response.headers
		.getSetCookie()
		.map((header) => header.split(";")[0])
		.find((pair) => pair.startsWith(`${SESSION_COOKIE}=`));
	if (!cookie) fail(`the sign-in set no ${SESSION_COOKIE} cookie`);
	const value = cookie.slice(SESSION_COOKIE.length + 1);
	const token = decodeURIComponent(value).split(".")[0];
	const ours = await newSession(writeWith(client), email);
	try {
		const { rows, columns } = await client.execute({
			sql: "select * from session where token = ?",
			args: [token],
		});
		const [real] = rows;
		if (!real) fail("no session row has the cookie's token");
		const unwritten = columns.filter((column) => !sessionColumns.includes(column));
		if (unwritten.length)
			fail(`the session table has columns it doesn't write: ${unwritten.join(", ")}`);
		if (value !== (await signedValue(token, secret))) fail("the cookie is signed otherwise");
		const organization = real.active_organization_id as string | null;
		if (organization !== ours.activeOrganizationId) {
			fail(`the session starts in ${organization}, not ${ours.activeOrganizationId}`);
		}
		const lifetime = Number(real.expires_at) - Number(real.created_at);
		if (Math.abs(lifetime - SESSION_LIFETIME) > 60_000) fail(`sessions last ${lifetime} ms`);
		const read = await fetch(`${baseURL}/api/auth/get-session`, {
			headers: {
				cookie: `${SESSION_COOKIE}=${(await sessionCookie(ours, baseURL, secret)).value}`,
			},
		});
		const body = (await read.json()) as { user?: { email?: string } } | null;
		if (body?.user?.email !== email) fail(`the app doesn't take its session (${read.status})`);
	} finally {
		await client.execute({
			sql: "delete from session where token in (?, ?)",
			args: [token, ours.token],
		});
	}
}
