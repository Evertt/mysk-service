import { form, query } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import { and, asc, eq, ne } from "drizzle-orm";
import * as v from "valibot";

import { id } from "#lib/schema.js";
import { db } from "#lib/server/db/index.js";
import { engineer, member, user } from "#lib/server/db/schema.js";
import { inTenant, requireMember, requireRole } from "#lib/server/session.js";

/** Roles that may link engineers to user accounts. */
const managers = ["owner", "admin"];

/**
 * The user account an engineer signs in to the engineer portal with, and (for owners and admins)
 * the organization's members it can be linked to: those not linked to another engineer.
 */
export const getEngineerAccount = query(v.number(), async (engineerId) => {
	const tenant = requireMember();
	const found = await db.query.engineer.findFirst({
		columns: { id: true, userId: true },
		where: and(eq(engineer.id, engineerId), inTenant(engineer)),
	});
	if (!found) error(404, "Engineer not found");

	const canManage = tenant.roles.some((role) => managers.includes(role));
	const [members, taken] = await Promise.all([
		db
			.select({ userId: user.id, name: user.name, email: user.email, role: member.role })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, tenant.organizationId))
			.orderBy(asc(user.name)),
		db
			.select({ userId: engineer.userId })
			.from(engineer)
			.where(and(inTenant(engineer), ne(engineer.id, found.id))),
	]);
	const linkedElsewhere = new Set(taken.map((row) => row.userId));
	return {
		canManage,
		linked: members.find((m) => m.userId === found.userId) ?? null,
		members: canManage ? members.filter((m) => !linkedElsewhere.has(m.userId)) : [],
	};
});

/** Links an engineer to a member's user account, or unlinks them (an empty `userId`). */
export const linkEngineerAccount = form(
	v.object({ id: id(), userId: v.string() }),
	async (input, issue) => {
		const { organizationId } = requireRole(...managers);
		const found = await db.query.engineer.findFirst({
			columns: { id: true },
			where: and(eq(engineer.id, input.id), inTenant(engineer)),
		});
		if (!found) error(404, "Engineer not found");

		const userId = input.userId || null;
		if (userId) {
			const [membership] = await db
				.select({ id: member.id })
				.from(member)
				.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
			if (!membership) invalid(issue.userId("Choose a member of this organization"));
			const other = await db.query.engineer.findFirst({
				columns: { name: true },
				where: and(inTenant(engineer), eq(engineer.userId, userId), ne(engineer.id, found.id)),
			});
			if (other) invalid(issue.userId(`This account is already linked to ${other.name}`));
		}
		await db
			.update(engineer)
			.set({ userId })
			.where(and(eq(engineer.id, found.id), inTenant(engineer)));
		void getEngineerAccount(found.id).refresh();
	},
);
