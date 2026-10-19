/**
 * What the app remembers of a member's data tables (see `table-memory.svelte.ts`): per table, the
 * columns they show and where they left it. Each member's own, in the current organization.
 *
 * Not in the activity log: like a personal view (see `views.remote.ts`), it concerns nobody else,
 * and it changes with every filter.
 */
import { and, eq, or } from "drizzle-orm";
import * as v from "valibot";

import { recordId } from "#lib/schema.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { savedView, tableMemory } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { columnVisibilitySchema, tableKeySchema, viewQuerySchema } from "./views.server.ts";

/** What's remembered of a table. */
export interface TableMemory {
	/** Which of its hideable columns are shown, if not the defaults. */
	columns: Record<string, boolean> | null;
	/** Its parameters as they were left, without where it was scrolled to: `""` or `?…`. */
	query: string;
	/** The saved view that was open (one the member still sees), if any. */
	viewId: number | null;
}

/** What's remembered of a table, and whose it is (see `memoryOwner`). */
export interface TableMemoryAnswer {
	owner: string;
	memory: TableMemory | null;
}

/**
 * Whose tables the request is about: the organization and the member, e.g. for what the browser
 * keeps of them (see `column-widths.svelte.ts`) and for a save that arrives after the member
 * switched organizations (see `rememberTable`).
 */
const memoryOwner = () => {
	const tenant = currentTenant();
	return `${tenant.organizationId}:${tenant.user.id}`;
};

/** The signed-in member's row of a table's memory. */
const memoryOf = (key: string) =>
	and(
		inTenant(tableMemory),
		eq(tableMemory.userId, currentTenant().user.id),
		eq(tableMemory.tableKey, key),
	);

/** The signed-in member's memory of a table (`null` if there's nothing to remember), and whose. */
export const getTableMemory = forMembers.query(
	tableKeySchema,
	async (key): Promise<TableMemoryAnswer> => {
		const [row] = await db
			.select({
				columns: tableMemory.columns,
				query: tableMemory.query,
				viewId: tableMemory.viewId,
			})
			.from(tableMemory)
			.where(memoryOf(key));
		return { owner: memoryOwner(), memory: row ?? null };
	},
);

/** Whether the member sees a view of the table: their own, or a shared one. */
async function seesView(viewId: number, key: string) {
	const tenant = currentTenant();
	const [found] = await db
		.select({ id: savedView.id })
		.from(savedView)
		.where(
			and(
				idInTenant(savedView, viewId),
				eq(savedView.tableKey, key),
				or(eq(savedView.userId, tenant.user.id), eq(savedView.shared, true)),
			),
		);
	return !!found;
}

/**
 * Remembers a table as the member left it; with nothing to remember (the default columns and
 * parameters, no view), forgets it. Only for its `owner`: a save that arrives once the member has
 * switched organizations (sent as they leave the page) belongs to the one they left, and is dropped.
 */
export const rememberTable = forMembers.command(
	v.object({
		owner: v.string(),
		tableKey: tableKeySchema,
		columns: v.nullable(columnVisibilitySchema),
		query: viewQuerySchema,
		viewId: v.nullable(recordId()),
	}),
	async (input) => {
		if (input.owner !== memoryOwner()) return;
		const tenant = currentTenant();
		const viewId = input.viewId !== null && (await seesView(input.viewId, input.tableKey));
		const memory = {
			columns: input.columns,
			query: input.query,
			viewId: viewId ? input.viewId : null,
		};
		if (!memory.columns && !memory.query && memory.viewId === null) {
			await db.delete(tableMemory).where(memoryOf(input.tableKey));
		} else {
			await db
				.insert(tableMemory)
				.values({
					...memory,
					organizationId: tenant.organizationId,
					userId: tenant.user.id,
					tableKey: input.tableKey,
				})
				.onConflictDoUpdate({
					target: [tableMemory.organizationId, tableMemory.userId, tableMemory.tableKey],
					set: memory,
				});
		}
	},
);
