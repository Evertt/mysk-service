import type { RemoteForm, RemoteFormInput } from "$app/server";
/**
 * A module's settings of a tenant: one row per organization (`organizationId` its primary key),
 * made with the defaults the first time it's read. `defineTenantSettings()` is the one way to keep
 * them; a module calls it in its `server/settings.ts`, and its settings remote file re-exports the
 * two remote functions:
 *
 * ```ts
 * // src/modules/condition/server/settings.ts
 * export const { settingsOf, getSettings, saveSettings } = defineTenantSettings(
 * 	"condition",
 * 	conditionSettings,
 * 	{ subject: "condition_settings", schema: settingsSchema },
 * );
 * // src/modules/condition/settings.remote.ts
 * export { getSettings as getConditionSettings, saveSettings as saveConditionSettings } from "./server/settings.ts";
 * ```
 *
 * Every member reads them (the settings page shows managers the form, the others what's set, with
 * `<ModuleSettingsPage>`); only managers save them, which logs `updated` on the `subject` and goes
 * back to the module's section. The daily run of automatic orders keeps its last run in them too
 * (`dailyOrderRun()`, `#lib/server/jobs/orders.ts`).
 */
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { GenericSchema, InferInput } from "valibot";

import { isManager } from "#lib/auth/index.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { moduleRemote } from "#lib/server/remote-functions.ts";

/** A settings table: a row per organization, keyed by it. */
export type SettingsTable = SQLiteTable & { organizationId: SQLiteColumn };

interface SettingsOptions<Table extends SettingsTable, Schema> {
	/** The subject type its changes are logged on (`condition_settings`): they have no name. */
	subject: Subject["type"];
	/** What a new row starts with besides the table's own defaults, worked out when it's made. */
	defaults?: () => Partial<Table["$inferInsert"]>;
	/** The settings page's form: the columns a manager changes. */
	schema: Schema;
}

/** The tenant's settings of `moduleId`, kept in `table` (see above). */
export function defineTenantSettings<
	Table extends SettingsTable,
	Schema extends GenericSchema<RemoteFormInput, Partial<Table["$inferInsert"]>>,
>(moduleId: ModuleId, table: Table, { subject, defaults, schema }: SettingsOptions<Table, Schema>) {
	type Settings = Table["$inferSelect"];
	const settingsTable = table as SettingsTable;
	const ofTenant = () => eq(table.organizationId, currentTenant().organizationId);
	const find = async (tx: Transaction | typeof db) =>
		(await tx.select().from(settingsTable).where(ofTenant()).limit(1))[0] as Settings | undefined;

	/**
	 * The current tenant's settings, made with the defaults when first read. Inside a transaction,
	 * pass it as `tx`.
	 */
	async function settingsOf(tx: Transaction | typeof db = db): Promise<Settings> {
		const found = await find(tx);
		if (found) return found;
		const { organizationId } = currentTenant();
		await tx
			.insert(settingsTable)
			.values({ ...defaults?.(), organizationId } as Table["$inferInsert"])
			.onConflictDoNothing();
		return (await find(tx))!;
	}

	/** Changes the current tenant's settings, without logging: the daily run's notes, say. */
	async function updateSettings(
		values: Partial<Table["$inferInsert"]>,
		tx: Transaction | typeof db = db,
	) {
		await tx.update(settingsTable).set(values).where(ofTenant());
	}

	const { query } = moduleRemote(moduleId);
	const forManagers = moduleRemote(moduleId, "manager");

	/** The tenant's settings, and whether the user may change them. */
	const getSettings = query(async () => ({
		...(await settingsOf()),
		canManage: isManager(currentTenant().roles),
	}));

	/** Saves the settings page's form, logs it and goes back to the module's section. */
	const saveSettings = forManagers.form(
		// Its input type, generic here, would read as having booleans that aren't optional.
		schema as GenericSchema<Record<string, string>, Record<string, unknown>>,
		async (input) => {
			const { organizationId } = currentTenant();
			const before = await settingsOf();
			await db.transaction(async (tx) => {
				await updateSettings(input as Partial<Table["$inferInsert"]>, tx);
				// The settings have no name of their own: they read as "<module> settings".
				const logged: Subject = { type: subject, id: organizationId, label: "" };
				await recordActivity(tx, { action: "updated", subject: logged, before, after: input });
			});
			void getSettings().refresh();
			// A module's section is at its id (its `routes/(app)/+page.svelte`).
			redirect(303, `/${moduleId}`);
		},
	) as unknown as RemoteForm<InferInput<Schema>, never>;

	return { settingsOf, updateSettings, getSettings, saveSettings };
}
