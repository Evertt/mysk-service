/**
 * Who a server spec runs as: the demo accounts of `demo.ts` (North's, South's and SHLTR's people),
 * by their organization and role, e.g. `north.owner`, `south.owner`, `shltr.engineer`. Where the
 * seed has no one with a role in an organization (an admin anywhere; a member, engineer or
 * customer contact in South), the harness adds an account to the spec file's database the first
 * time it's used, linked as the seed links its own: an engineer to the organization's first active
 * engineer without an account, a customer contact to its first customer (all sites).
 */
import { and, asc, eq, isNull } from "drizzle-orm";

import { demoOrganizations, demoUsers } from "#lib/server/db/demo.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, member, portalContact, user } from "#lib/server/db/schema.ts";

/** The demo organizations, as the harness names them. */
export type Organization = keyof typeof demoOrganizations;

/** A member's role (see `memberRoles` in `#lib/auth/roles.ts`). */
type Role = "owner" | "admin" | "member" | "engineer" | "customer";

/** Someone to run server code as (`as()` in `request.ts`). */
export interface Actor {
	organization: Organization;
	role: Role;
	/** Their account's email: a demo user's, or one the harness adds (see above). */
	email: string;
}

const roles: Role[] = ["owner", "admin", "member", "engineer", "customer"];

const organizationOf = (id: string) =>
	(Object.keys(demoOrganizations) as Organization[]).find(
		(key) => demoOrganizations[key].id === id,
	)!;

/** The first demo user with `role` in `organization`, else the harness's account for it. */
function actorOf(organization: Organization, role: Role): Actor {
	const { id } = demoOrganizations[organization];
	const demo = demoUsers.find((candidate) =>
		candidate.memberships.some((m) => m.organizationId === id && m.role === role),
	);
	return { organization, role, email: demo?.email ?? `${role}@${organization}.harness.example` };
}

type Actors = Record<Role, Actor>;

const actorsOf = (organization: Organization) =>
	Object.fromEntries(roles.map((role) => [role, actorOf(organization, role)])) as Actors;

/**
 * North (Fieldworks Noord): its owner (Anouk, also South's), its planner (`member`, Pieter), its
 * field engineer (Erik) and the contact of its first customer (Bram); an admin is added.
 */
export const north = actorsOf("north");

/** South (Fieldworks Zuid): its owner (Anouk, also North's); the other roles are added. */
export const south = actorsOf("south");

/**
 * SHLTR: its owner (Marloes), planner (`member`, Jan), engineer (Lev) and Riedel's contact
 * (`customer`); an admin is added. Its other customers' contacts by `demoAccount()`.
 */
export const shltr = actorsOf("shltr");

/** A demo user by their email, e.g. Weggemans' contact, in `organization` (else their first). */
export function demoAccount(email: string, organization?: Organization): Actor {
	const demo = demoUsers.find((candidate) => candidate.email === email);
	if (!demo) throw new Error(`No demo user ${email} (see demo.ts)`);
	const membership = organization
		? demo.memberships.find((m) => m.organizationId === demoOrganizations[organization].id)
		: demo.memberships[0];
	if (!membership) throw new Error(`${email} isn't a member of ${organization}`);
	return {
		organization: organizationOf(membership.organizationId),
		role: membership.role as Role,
		email,
	};
}

/** The account of `actor` in this file's database: their user row, added if it's the harness's. */
export async function accountOf(actor: Actor) {
	const found = await db.query.user.findFirst({ where: eq(user.email, actor.email) });
	return found ?? (await addAccount(actor));
}

/** Adds the harness's account for `actor`: a user, their membership, and their link. */
async function addAccount(actor: Actor) {
	const organizationId = demoOrganizations[actor.organization].id;
	return db.transaction(async (tx) => {
		const [added] = await tx
			.insert(user)
			.values({
				id: crypto.randomUUID(),
				name: `${demoOrganizations[actor.organization].name} ${actor.role}`,
				email: actor.email,
				emailVerified: true,
			})
			.returning();
		await tx.insert(member).values({
			id: crypto.randomUUID(),
			organizationId,
			userId: added.id,
			role: actor.role,
			createdAt: new Date(),
		});
		if (actor.role === "engineer") {
			const [first] = await tx
				.select({ id: engineer.id })
				.from(engineer)
				.where(
					and(
						eq(engineer.organizationId, organizationId),
						eq(engineer.active, true),
						isNull(engineer.userId),
					),
				)
				.orderBy(asc(engineer.id))
				.limit(1);
			await tx.update(engineer).set({ userId: added.id }).where(eq(engineer.id, first.id));
		}
		if (actor.role === "customer") {
			const [first] = await tx
				.select({ id: customer.id })
				.from(customer)
				.where(eq(customer.organizationId, organizationId))
				.orderBy(asc(customer.id))
				.limit(1);
			await tx.insert(portalContact).values({
				organizationId,
				customerId: first.id,
				email: actor.email,
				userId: added.id,
				allSites: true,
			});
		}
		return added;
	});
}
