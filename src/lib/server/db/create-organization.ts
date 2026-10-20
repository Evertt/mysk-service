/**
 * Creates an organization and its owner, e.g. the first ones on a new deployment (see "Deploying"
 * in README.md); after that, the owner invites everyone else. The owner gets a generated password,
 * printed once. Refuses if the slug or the owner's email address is taken.
 *
 * Run with `pnpm run org:create -- --org "Acme Service" --slug acme --owner-email … --owner-name …`
 * (after `pnpm db:migrate`); `--help` says more.
 */
import { randomBytes } from "node:crypto";

import { createClient } from "@libsql/client";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { parseCreateArgs, usage, UsageError } from "./create-organization-args.ts";
import * as schema from "./schema.ts";

const { account, member, organization, organizationModule, user } = schema;

let options: ReturnType<typeof parseCreateArgs>;
try {
	options = parseCreateArgs(process.argv.slice(2));
} catch (error) {
	if (!(error instanceof UsageError)) throw error;
	console.error(`${error.message}\n\n${usage}`);
	process.exit(1);
}
if (options === "help") {
	console.log(usage);
	process.exit(0);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const db = drizzle(
	createClient({ url: DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }),
	{ schema },
);

/** 18 random bytes: 24 characters, letters, digits, `-` and `_`. */
const password = randomBytes(18).toString("base64url");
const now = new Date();

const problem = await db.transaction(async (tx) => {
	const [slugTaken, emailTaken] = await Promise.all([
		tx.query.organization.findFirst({
			columns: { name: true },
			where: eq(organization.slug, options.slug),
		}),
		tx.query.user.findFirst({ columns: { id: true }, where: eq(user.email, options.ownerEmail) }),
	]);
	if (slugTaken) return `The slug ${options.slug} is taken, by ${slugTaken.name}.`;
	if (emailTaken) {
		return `There's an account for ${options.ownerEmail} already; choose another owner.`;
	}

	const organizationId = crypto.randomUUID();
	const userId = crypto.randomUUID();
	await tx
		.insert(organization)
		.values({ id: organizationId, name: options.org, slug: options.slug, createdAt: now });
	// The account as better-auth's email sign-up would make it.
	await tx.insert(user).values({
		id: userId,
		name: options.ownerName,
		email: options.ownerEmail,
		emailVerified: true,
	});
	await tx.insert(account).values({
		id: crypto.randomUUID(),
		accountId: userId,
		providerId: "credential",
		userId,
		password: await hashPassword(password),
	});
	await tx
		.insert(member)
		.values({ id: crypto.randomUUID(), organizationId, userId, role: "owner", createdAt: now });
	if (options.modules.length) {
		await tx
			.insert(organizationModule)
			.values(options.modules.map((moduleId) => ({ organizationId, moduleId })));
	}
	return undefined;
});

if (problem) {
	console.error(problem);
	process.exit(1);
}

console.log(
	[
		`Created ${options.org} (${options.slug})` +
			(options.modules.length ? `, with ${options.modules.join(", ")}.` : "."),
		`Its owner, ${options.ownerName}, signs in with:`,
		"",
		`  Email:     ${options.ownerEmail}`,
		`  Password:  ${password}`,
		"",
		"The password isn't stored anywhere else and won't be shown again: pass it on safely.",
	].join("\n"),
);
