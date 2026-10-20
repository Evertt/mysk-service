/**
 * Columns that the tables of the core (`schema/`) and of the modules
 * (`src/modules/<id>/server/schema.ts`) share, and the one way to declare a tenant's table:
 * `tenantTable()`, with `tenantRef()` for a reference to another of the tenant's tables,
 * `optionalTenantColumns()` and `optionalTenantRef()` for one that a deletion may clear, and
 * `tenantOne()` for the relation. `tenant-tables.spec.ts` refuses the hand-written forms.
 */
import {
	type AnyColumn,
	type BuildColumns,
	type createOne,
	getTableColumns,
	getTableName,
	type One,
	sql,
} from "drizzle-orm";
import {
	type AnySQLiteColumn,
	check,
	customType,
	foreignKey,
	index,
	integer,
	type SQLiteColumnBuilderBase,
	type SQLiteTable,
	type SQLiteTableExtraConfigValue,
	sqliteTable,
	text,
	type UpdateDeleteAction,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { fromMomentSeconds, momentSeconds } from "../../dates.ts";
import { organization } from "./auth.schema.ts";

/**
 * The tenant a row belongs to. Every business table has one, except contract coverage, whose
 * customer pins it to a tenant. Queries scope by it with `inTenant()` from
 * `#lib/server/auth/session.ts`. Deleting the organization deletes its rows. Only `tenantTable()`
 * adds it.
 */
const organizationId = () =>
	text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" });

/** How a tenant's table is keyed, see `tenantTable()`. */
type TenantKey = "id" | "tenant" | "own";

const keyColumns = {
	id: () => ({
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
	}),
	tenant: () => ({ organizationId: organizationId().primaryKey() }),
	own: () => ({ organizationId: organizationId() }),
};

type KeyColumns<K extends TenantKey> = ReturnType<(typeof keyColumns)[K]>;

interface TenantTableOptions<K extends TenantKey> {
	/**
	 * - `id` (the default): a number of its own, `id`, from 1 across tenants;
	 * - `tenant`: one row per tenant, keyed by it (a module's settings);
	 * - `own`: keyed by its own columns, a `primaryKey()` in `extra` or a column's.
	 */
	key?: K;
	/**
	 * Other tables refer to its rows (`tenantRef()`): gives it the unique index on
	 * `(organization_id, id)`, named `<table>_organization_id`, that their keys point at.
	 */
	referenced?: K extends "id" ? boolean : never;
}

/**
 * A table of the tenant's: `organization_id` (see above) and, unless `options.key` says otherwise,
 * an `id`, before `columns`. `extra` is `sqliteTable()`'s: indexes, checks and keys, references to
 * the tenant's other tables with `tenantRef()`.
 *
 * ```ts
 * export const customerSite = tenantTable(
 *   "customer_site",
 *   { customerId: integer("customer_id").notNull(), name: text("name").notNull() },
 *   (table) => [tenantRef(table, table.customerId, customer, { onDelete: "cascade" })],
 *   { referenced: true },
 * );
 * ```
 */
export function tenantTable<
	TName extends string,
	TColumns extends Record<string, SQLiteColumnBuilderBase>,
	K extends TenantKey = "id",
>(
	name: TName,
	columns: TColumns,
	extra?: (
		table: BuildColumns<TName, KeyColumns<K> & TColumns, "sqlite">,
	) => SQLiteTableExtraConfigValue[],
	options: TenantTableOptions<K> = {},
) {
	const key = keyColumns[options.key ?? "id"]() as KeyColumns<K>;
	return sqliteTable(name, { ...key, ...columns }, (table) => [
		...(options.referenced
			? [
					uniqueIndex(`${name}_organization_id`).on(
						table.organizationId,
						(table as unknown as { id: AnySQLiteColumn }).id,
					),
				]
			: []),
		...(extra?.(table) ?? []),
	]);
}

/** A tenant's table's columns, as `extra` and relations see them. */
type TenantColumns = { organizationId: AnySQLiteColumn };

/** The `id` of a table other tenant tables refer to (`referenced: true`). */
const idOf = (target: SQLiteTable) => (target as unknown as { id: AnySQLiteColumn }).id;

/**
 * A reference from `table`'s `column` to a row of the same tenant's `target`: the composite foreign
 * key `(organization_id, <column>)` → `<target> (organization_id, id)`, so the database refuses a
 * row of another tenant's. `to` refers to other columns than `id` (a unique index's, with
 * `organization_id` first), with as many columns in `column`.
 */
export function tenantRef(
	table: TenantColumns,
	column: AnySQLiteColumn | AnySQLiteColumn[],
	target: SQLiteTable & TenantColumns,
	options: { onDelete?: UpdateDeleteAction; to?: AnySQLiteColumn[] } = {},
) {
	const columns = Array.isArray(column) ? column : [column];
	const to = options.to ?? [idOf(target)];
	return reference([table.organizationId, ...columns], [target.organizationId, ...to], options);
}

function reference(
	columns: AnySQLiteColumn[],
	foreignColumns: AnySQLiteColumn[],
	{ onDelete }: { onDelete?: UpdateDeleteAction },
) {
	const key = foreignKey({
		columns: columns as [AnySQLiteColumn],
		foreignColumns: foreignColumns as [AnySQLiteColumn],
	});
	return onDelete ? key.onDelete(onDelete) : key;
}

/** `lastOrder` → `last_order`. */
const snake = (name: string) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * The columns of an optional reference to a row of the tenant's that its deletion clears, e.g. a
 * dock's door (a unit): `<name>Id` and the tenant's id of its own, `<name>OrganizationId`, as
 * SQLite's `on delete set null` clears every column of a key and `organization_id` can't be null.
 * Its key is `optionalTenantRef()`; set both with `withTenantRefs()`.
 */
export function optionalTenantColumns<N extends string>(name: N) {
	const { id, tenant } = optionalColumns(snake(name));
	return { [`${name}Id`]: id, [`${name}OrganizationId`]: tenant } as {
		[P in `${N}Id`]: typeof id;
	} & { [P in `${N}OrganizationId`]: typeof tenant };
}

const optionalColumns = (name: string) => ({
	id: integer(`${name}_id`),
	tenant: text(`${name}_organization_id`),
});

/**
 * The key of an optional reference (`optionalTenantColumns(name)`) to `target`: its index
 * `<table>_<name>`, on the tenant column first unless `idFirst` (for looking it up without the
 * tenant), its foreign key, which a deletion of the row sets to null, and the check
 * `<table>_<name>_tenant` that holds its tenant to the row's.
 */
export function optionalTenantRef<N extends string>(
	table: TenantColumns & Record<`${N}Id` | `${N}OrganizationId`, AnySQLiteColumn>,
	name: N,
	target: SQLiteTable & TenantColumns,
	{ idFirst = false } = {},
) {
	const columns = table as unknown as Record<string, AnySQLiteColumn>;
	const id = columns[`${name}Id`];
	const tenant = columns[`${name}OrganizationId`];
	const prefix = `${getTableName(table.organizationId.table)}_${snake(name)}`;
	return [
		idFirst ? index(prefix).on(id, tenant) : index(prefix).on(tenant, id),
		reference([tenant, id], [target.organizationId, idOf(target)], {
			onDelete: "set null",
		}),
		check(`${prefix}_tenant`, sql`${tenant} is null or ${tenant} = ${table.organizationId}`),
	];
}

/**
 * `refs` (`{ doorId, levellerId }`) with their tenant columns (`doorOrganizationId`, …): the
 * `organizationId` where there's a reference, else none. For the write side of
 * `optionalTenantColumns()`.
 */
export function withTenantRefs<T extends Record<`${string}Id`, number | null | undefined>>(
	organizationId: string,
	refs: T,
) {
	const tenants = Object.fromEntries(
		Object.entries(refs).map(([key, value]) => [
			key.replace(/Id$/, "OrganizationId"),
			value == null ? null : organizationId,
		]),
	);
	return { ...refs, ...tenants } as T & {
		[P in keyof T as P extends `${infer N}Id` ? `${N}OrganizationId` : never]: string | null;
	};
}

/**
 * The relation of `column`, a reference to `target` (`tenantRef()`, or `optionalTenantRef()`), on
 * the same column pairs as its key, so a `with:` load stays in the tenant:
 * `customer: tenantOne(one, customerSite.customerId, customer)`.
 */
export function tenantOne<
	TName extends string,
	TColumn extends AnyColumn<{ tableName: TName }>,
	TTarget extends SQLiteTable & TenantColumns,
>(one: ReturnType<typeof createOne<TName>>, column: TColumn, target: TTarget) {
	const columns = getTableColumns(column.table);
	const name = Object.keys(columns).find((key) => columns[key] === column)!;
	const tenant = columns[name.replace(/Id$/, "OrganizationId")] ?? columns.organizationId;
	return one(target, {
		fields: [tenant as AnyColumn<{ tableName: TName }>, column],
		references: [target.organizationId, idOf(target)],
	}) as One<TTarget["_"]["name"], TColumn["_"]["notNull"] extends true ? true : false>;
}

/**
 * A moment, e.g. when an order was created or is scheduled for: a `Temporal.Instant` in the app,
 * whole seconds since 1970 (UTC) in the database, so SQLite's `unixepoch()` can make one.
 */
export const moment = customType<{ data: Temporal.Instant; driverData: number }>({
	dataType: () => "integer",
	toDriver: momentSeconds,
	fromDriver: (seconds) => fromMomentSeconds(Number(seconds)),
});

/**
 * A moment to the millisecond (milliseconds since 1970, UTC), for what must keep the order of
 * events that come faster than a second, such as a dock's last event (`dock_state.last_event_at`).
 */
export const momentMs = customType<{ data: Temporal.Instant; driverData: number }>({
	dataType: () => "integer",
	toDriver: (instant) => instant.epochMilliseconds,
	fromDriver: (milliseconds) => Temporal.Instant.fromEpochMilliseconds(Number(milliseconds)),
});

/**
 * A day on the calendar, e.g. a due date or when a contract starts: a `Temporal.PlainDate` in the
 * app, `yyyy-mm-dd` in the database. No time zone: it's the same day for everyone, and days
 * compare and sort as text.
 */
export const day = customType<{ data: Temporal.PlainDate; driverData: string }>({
	dataType: () => "text",
	toDriver: (date) => date.toString(),
	fromDriver: (text) => Temporal.PlainDate.from(text),
});

/** When the row was made, by the database. */
export const createdAt = () =>
	moment("created_at")
		.notNull()
		.default(sql`(unixepoch())`);
