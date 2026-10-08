/**
 * Saved views of the data tables (see `views.ts`): a member's own views of a table, and the views
 * owners and admins shared with the organization. A view is changed by its creator, or, if it's
 * shared, by an owner or admin too.
 *
 * Only shared views are in the activity log: a personal view concerns nobody else (and its name
 * would show in the organization's log), much like a column setting. Creating a shared view,
 * sharing and unsharing one, changing and deleting one are logged.
 */
import { command, form, query } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import * as v from "valibot";

import { m } from "#lib/paraglide/messages.js";
import { id, text } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { user } from "#lib/server/db/auth.schema.js";
import { db } from "#lib/server/db/index.js";
import { savedView } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import type { Transaction } from "#lib/server/stock.js";

import { canShareViews, viewNameMax, viewQueryMax } from "./views.js";

const tableKey = v.pipe(v.string(), v.nonEmpty(), v.maxLength(200));

const viewName = v.pipe(
	text(m.common_views_name_required),
	v.maxLength(viewNameMax, () => m.common_views_name_too_long({ max: viewNameMax })),
);

/** A table's parameters as its URL has them: `""` or `?…`. */
const viewQuery = v.pipe(
	v.string(),
	v.maxLength(viewQueryMax),
	v.check((value) => value === "" || value.startsWith("?")),
);

/** A view as the menu shows it. */
export interface TableView {
	id: number;
	name: string;
	query: string;
	shared: boolean;
	/** Whether the signed-in user saved it. */
	mine: boolean;
	/** Who saved it, for a view someone else shared. */
	owner: string | null;
	/** Whether the signed-in user may change it. */
	editable: boolean;
}

/** The views of a table the signed-in user sees: their own, and shared ones, by name. */
export const getTableViews = query(tableKey, async (key) => {
	const tenant = requireMember();
	const rows = await db
		.select({
			id: savedView.id,
			name: savedView.name,
			query: savedView.query,
			shared: savedView.shared,
			userId: savedView.userId,
			owner: user.name,
		})
		.from(savedView)
		.innerJoin(user, eq(user.id, savedView.userId))
		.where(
			and(
				inTenant(savedView),
				eq(savedView.tableKey, key),
				or(eq(savedView.userId, tenant.user.id), eq(savedView.shared, true)),
			),
		)
		.orderBy(sql`${savedView.name} collate nocase`, asc(savedView.id));
	const canShare = canShareViews(tenant.roles);
	return {
		/** Whether the user may share views with the organization. */
		canShare,
		views: rows.map(({ userId, owner, ...row }): TableView => ({
			...row,
			mine: userId === tenant.user.id,
			owner: userId === tenant.user.id ? null : owner,
			editable: userId === tenant.user.id || canShare,
		})),
	};
});

/**
 * A view the signed-in user sees (their own or a shared one), or a 404; with `edit`, one they may
 * change, or a 403.
 */
async function findView(viewId: number, { edit = false } = {}) {
	const tenant = requireMember();
	const [found] = await db
		.select()
		.from(savedView)
		.where(
			and(
				eq(savedView.id, viewId),
				inTenant(savedView),
				or(eq(savedView.userId, tenant.user.id), eq(savedView.shared, true)),
			),
		);
	if (!found) error(404, m.common_views_not_found());
	if (edit && found.userId !== tenant.user.id && !canShareViews(tenant.roles)) {
		error(403, m.common_error_no_permission());
	}
	return found;
}

/** Whether the owner of a table's views already has one called `name` (ignoring case). */
async function nameTaken(
	tx: Transaction,
	view: { userId: string; tableKey: string; name: string },
	except?: number,
) {
	const [taken] = await tx
		.select({ id: savedView.id })
		.from(savedView)
		.where(
			and(
				inTenant(savedView),
				eq(savedView.userId, view.userId),
				eq(savedView.tableKey, view.tableKey),
				sql`lower(${savedView.name}) = lower(${view.name})`,
				except === undefined ? undefined : ne(savedView.id, except),
			),
		);
	return !!taken;
}

const subjectOf = (view: { id: number; name: string }) => ({
	type: "saved_view",
	id: view.id,
	label: view.name,
});

/** Saves a table's current parameters as a view of the signed-in user's, shared if asked. */
export const createView = form(
	v.object({
		tableKey,
		name: viewName,
		query: viewQuery,
		shared: v.optional(v.boolean(), false),
	}),
	async (input, issue) => {
		const tenant = requireMember();
		if (input.shared && !canShareViews(tenant.roles)) error(403, m.common_error_no_permission());
		const created = await db.transaction(async (tx) => {
			const view = { ...input, userId: tenant.user.id };
			if (await nameTaken(tx, view)) {
				invalid(issue.name(m.common_views_name_taken({ name: input.name })));
			}
			const [row] = await tx
				.insert(savedView)
				.values({ ...view, organizationId: tenant.organizationId })
				.returning();
			if (row.shared) await recordActivity(tx, { action: "created", subject: subjectOf(row) });
			return row;
		});
		void getTableViews(input.tableKey).refresh();
		return { id: created.id };
	},
);

/** Renames a view. */
export const renameView = form(v.object({ id: id(), name: viewName }), async (input, issue) => {
	const existing = await findView(input.id, { edit: true });
	await db.transaction(async (tx) => {
		if (await nameTaken(tx, { ...existing, name: input.name }, existing.id)) {
			invalid(issue.name(m.common_views_name_taken({ name: input.name })));
		}
		await tx
			.update(savedView)
			.set({ name: input.name })
			.where(and(eq(savedView.id, existing.id), inTenant(savedView)));
		if (existing.shared) {
			await recordActivity(tx, {
				action: "updated",
				subject: subjectOf({ ...existing, name: input.name }),
				before: existing,
				after: { name: input.name },
			});
		}
	});
	void getTableViews(existing.tableKey).refresh();
});

/** Saves a table's current parameters in an existing view. */
export const updateView = command(
	v.object({ id: v.pipe(v.number(), v.integer()), query: viewQuery }),
	async (input) => {
		const existing = await findView(input.id, { edit: true });
		await db.transaction(async (tx) => {
			await tx
				.update(savedView)
				.set({ query: input.query })
				.where(and(eq(savedView.id, existing.id), inTenant(savedView)));
			if (existing.shared) {
				await recordActivity(tx, {
					action: "updated",
					subject: subjectOf(existing),
					before: existing,
					after: { query: input.query },
				});
			}
		});
		void getTableViews(existing.tableKey).refresh();
	},
);

/** Shares a view with the organization, or stops sharing it: for owners and admins. */
export const shareView = command(
	v.object({ id: v.pipe(v.number(), v.integer()), shared: v.boolean() }),
	async (input) => {
		const tenant = requireMember();
		if (!canShareViews(tenant.roles)) error(403, m.common_error_no_permission());
		const existing = await findView(input.id, { edit: true });
		if (existing.shared === input.shared) return;
		await db.transaction(async (tx) => {
			await tx
				.update(savedView)
				.set({ shared: input.shared })
				.where(and(eq(savedView.id, existing.id), inTenant(savedView)));
			await recordActivity(tx, {
				action: input.shared ? "shared" : "unshared",
				subject: subjectOf(existing),
			});
		});
		void getTableViews(existing.tableKey).refresh();
	},
);

/** Deletes a view. */
export const deleteView = command(v.pipe(v.number(), v.integer()), async (viewId) => {
	const existing = await findView(viewId, { edit: true });
	await db.transaction(async (tx) => {
		await tx.delete(savedView).where(and(eq(savedView.id, existing.id), inTenant(savedView)));
		if (existing.shared) {
			await recordActivity(tx, { action: "deleted", subject: subjectOf(existing) });
		}
	});
	void getTableViews(existing.tableKey).refresh();
});
