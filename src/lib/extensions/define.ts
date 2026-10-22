/**
 * Extension points: the places where modules take part in their owner's pages and logic. The
 * owner (core, in `#lib/<domain>/extensions.ts`, or a module, in its `api/extensions.ts`) declares
 * each as a typed value whose id starts with the owner's id and is a string literal, e.g.
 * `defineCollector<In, Out>("orders.adjustPrices", { onError: "fail" })`, which `scripts/modules.ts`
 * reads without running the file. Isomorphic: a point is only its id and kind (its types ride along
 * for the compiler).
 *
 * - A record's points (`defineRecordPoints()`): the slots of its page and its list's columns and
 *   bulk actions, one call per record, named alike for every one (`orders.detail.side`,
 *   `orders.list.bulk`, `equipment.list.columns`).
 * - Hooks (collectors, events, votes, save hooks): modules contribute with `contribute()` in their
 *   `server/index.ts`, and the owner calls them with `collect()`, `emit()`, `vote()` or `save()`, all in
 *   `#lib/server/extensions.ts`, which also says how each kind runs.
 * - Slots and bulk tables: modules contribute by file, a component at
 *   `src/modules/<id>/slots/<point id>/<name>.svelte` and bulk actions as the default export of
 *   `src/modules/<id>/bulk-actions/<point id>.ts`. The generator lists them in
 *   `contributions.gen.ts` with `slotContribution()` and `bulkContribution()`, which hold each to
 *   its point's types.
 * - Form slots: a slot inside a core form (`defineFormSlot()`), whose components add inputs that are
 *   submitted with the form. A module contributing to one also gives the schema of its part, the
 *   default export of `src/modules/<id>/form-parts/<point id>.ts` (a valibot object schema). The
 *   generator lists the schemas in `form-parts.gen.ts`, which the form's own schema is made from
 *   (`formPartsSchema()` in `#lib/extensions/form-parts.ts`), and holds each component to its
 *   part's schema (`formSlotContribution()`).
 * - List columns: modules contribute by file too, two files per list: the columns' definitions
 *   and cells (`src/modules/<id>/columns/<point id>.ts`, listed with `columnsContribution()`) and
 *   their SQL (`src/modules/<id>/server/columns/<point id>.ts`, in the server's
 *   `#lib/server/lists/columns.gen.ts`). See `#lib/components/data-table/module-columns.ts`.
 */
import type { RemoteFormFields, RemoteFormInput } from "$app/server";
import type { Component } from "svelte";
import type * as v from "valibot";

import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import type { ModuleListColumn } from "#lib/components/data-table/module-columns.ts";
import type { ModuleId } from "#lib/modules/ids.ts";

/**
 * What a collector does when a contributor throws: `fail` fails the request (a broken price must
 * not quietly become a wrong total), `skip` logs it and leaves its answer out (an order's badges).
 */
export type OnError = "fail" | "skip";

/** Carries a point's types for the compiler; never set. */
interface Typed<Types> {
	readonly types?: Types;
}

/** Every contributor is asked about the input, in parallel; the owner merges their answers. */
export interface CollectorPoint<In, Out> extends Typed<{ input: In; output: Out }> {
	readonly id: string;
	readonly kind: "collector";
	readonly onError: OnError;
}

/**
 * A collector whose contributors answer at once, without awaiting anything: for an owner that
 * can't wait, such as the SQL of a list's column, which is built while the list's query is (see
 * `collectNow()` in `#lib/server/extensions.ts`). Its answers are usually SQL, built per request.
 */
export interface ImmediateCollectorPoint<In, Out> extends CollectorPoint<In, Out> {
	readonly now: true;
}

/** Every contributor is told, once the change it's about has committed. */
export interface EventPoint<Payload> extends Typed<{ payload: Payload }> {
	readonly id: string;
	readonly kind: "event";
}

/**
 * Every contributor is asked whether something may happen and answers with a refusal (a message)
 * or nothing; any refusal wins.
 */
export interface VotePoint<In> extends Typed<{ input: In }> {
	readonly id: string;
	readonly kind: "vote";
	/** Whether the modules the tenant has switched off are asked too (see `defineVote()`). */
	readonly alsoOff: boolean;
}

/**
 * Every contributor saves its part of a change inside the owner's transaction (the input carries
 * it), one after another, and answers the `Problem`s that keep it from saving, or nothing. The
 * first problems stop the rest, and the owner refuses the change, which rolls the transaction back.
 */
export interface SaveHookPoint<In, Problem> extends Typed<{ input: In; problem: Problem }> {
	readonly id: string;
	readonly kind: "save";
}

/**
 * Declares a collector: contributors answer with `Out` about `In`. With `now: true`, they answer
 * at once (an `ImmediateCollectorPoint`, asked with `collectNow()`).
 */
export function defineCollector<In, Out>(
	id: string,
	options: { onError: OnError; now: true },
): ImmediateCollectorPoint<In, Out>;
export function defineCollector<In, Out>(
	id: string,
	options: { onError: OnError },
): CollectorPoint<In, Out>;
export function defineCollector<In, Out>(
	id: string,
	{ onError, now }: { onError: OnError; now?: true },
): CollectorPoint<In, Out> {
	if (!now) return { id, kind: "collector", onError };
	const point: ImmediateCollectorPoint<In, Out> = { id, kind: "collector", onError, now };
	return point;
}

/** Declares an event, told `Payload` after commit. */
export const defineEvent = <Payload>(id: string): EventPoint<Payload> => ({ id, kind: "event" });

/**
 * Declares a vote about `In`. With `alsoOff: true` the modules the tenant has switched off are
 * asked too, each told whether it's on: for a change that would take a module's records with it,
 * which a module that's off still keeps (a customer site's removal would cascade to its docks).
 */
export const defineVote = <In>(
	id: string,
	{ alsoOff = false }: { alsoOff?: boolean } = {},
): VotePoint<In> => ({ id, kind: "vote", alsoOff });

/** Declares a save hook: contributors save their part of `In`, or answer `Problem`s. */
export const defineSaveHook = <In, Problem>(id: string): SaveHookPoint<In, Problem> => ({
	id,
	kind: "save",
});

/** A place on the owner's pages where modules add components, which get `Props`. */
export interface SlotPoint<Props extends Record<string, unknown>> extends Typed<{ props: Props }> {
	readonly id: string;
	readonly kind: "slot";
}

/** A table whose selection modules add bulk actions to, which get its `Row`s. */
export interface BulkTable<Row> extends Typed<{ row: Row }> {
	readonly id: string;
	readonly kind: "bulk";
}

/**
 * A slot inside a core form, where modules add inputs that are submitted with it: each module's
 * under the form's `modules.<module id>`, as the schema of its part says. Its components get `Props`
 * and their part's fields (`fields`, see `FormPartFields`).
 */
export interface FormSlotPoint<Props extends Record<string, unknown>> extends Typed<{
	props: Props;
}> {
	readonly id: string;
	readonly kind: "form";
}

/**
 * The schema of a module's part of a form (`src/modules/<id>/form-parts/<point id>.ts`): an object
 * of the part's inputs, as a remote form submits them.
 */
export type FormPartSchema = v.GenericSchema<RemoteFormInput, Record<string, unknown>>;

/** A module's part's fields in a form, typed from its schema: what its components name inputs with. */
export type FormPartFields<Part extends FormPartSchema> = RemoteFormFields<v.InferInput<Part>>;

/** Declares a slot, whose components get `Props`. */
export const defineSlot = <Props extends Record<string, unknown>>(
	id: string,
): SlotPoint<Props> => ({
	id,
	kind: "slot",
});

/** Declares a form slot, whose components get `Props` and their module's part's fields. */
export const defineFormSlot = <Props extends Record<string, unknown>>(
	id: string,
): FormSlotPoint<Props> => ({ id, kind: "form" });

/** Declares a table that modules add bulk actions to, for its `Row`s. */
export const defineBulkTable = <Row>(id: string): BulkTable<Row> => ({ id, kind: "bulk" });

/**
 * A server-side list that modules add columns to, sorted and filtered in the database like its
 * own. The list's definition names it (`defineList({ moduleColumns })`).
 */
export interface ListColumnsPoint {
	readonly id: string;
	readonly kind: "columns";
}

/**
 * Declares a server-side list that modules add columns to: a record's (`defineRecordPoints()`), or
 * a module's own (condition's units, `condition.list.columns`).
 */
export const defineListColumns = (id: string): ListColumnsPoint => ({ id, kind: "columns" });

/** Carries a type in `defineRecordPoints()`'s options; never read. */
export interface Shape<T> {
	readonly shape?: T;
}

/** The props of a record's detail slots, in `defineRecordPoints()`. */
export const slotProps = <Props extends Record<string, unknown>>(): Shape<Props> => ({});

/** The rows of a record's list's selection, in `defineRecordPoints()`. */
export const bulkRows = <Row>(): Shape<Row> => ({});

/** What a record's points are declared with: which list points it has, and their types. */
interface RecordPointOptions {
	/** Its list takes the modules' columns. */
	listColumns?: true;
	/** Its list's selection takes the modules' bulk actions, for these rows. */
	bulk?: Shape<unknown>;
}

/** A record's points on its list page, as its options ask for them. */
type ListPoints<Options extends RecordPointOptions> = (Options extends { listColumns: true }
	? { readonly columns: ListColumnsPoint }
	: unknown) &
	(Options extends { bulk: Shape<infer Row> } ? { readonly bulk: BulkTable<Row> } : unknown);

/** A core record's extension points, in one shape for every domain. */
export interface RecordPoints<Props extends Record<string, unknown>, List> {
	/** The two columns of its page (`RecordPage`): cards after its own, each column's. */
	readonly detail: { readonly main: SlotPoint<Props>; readonly side: SlotPoint<Props> };
	readonly list: List;
}

/**
 * Declares a core record's extension points, named alike for every domain: `<owner>.detail.main`
 * and `<owner>.detail.side` (slots on its page, whose components get `detail`'s props), and, when
 * asked for, `<owner>.list.columns` (its list takes columns) and `<owner>.list.bulk` (its list's
 * selection takes bulk actions, for `bulk`'s rows):
 *
 * ```ts
 * export const points = defineRecordPoints("orders", {
 * 	detail: slotProps<{ number: string }>(),
 * 	bulk: bulkRows<OrderBulkRow>(),
 * });
 * ```
 *
 * `scripts/modules.ts` reads the call like the other declarations (the owner is a literal).
 */
export function defineRecordPoints<
	Props extends Record<string, unknown>,
	const Options extends RecordPointOptions,
>(
	owner: string,
	options: Options & { detail: Shape<Props> },
): RecordPoints<Props, ListPoints<Options>> {
	const list = {
		...(options.listColumns && { columns: defineListColumns(`${owner}.list.columns`) }),
		...(options.bulk && { bulk: defineBulkTable(`${owner}.list.bulk`) }),
	};
	return {
		detail: {
			main: defineSlot<Props>(`${owner}.detail.main`),
			side: defineSlot<Props>(`${owner}.detail.side`),
		},
		list: list as ListPoints<Options>,
	};
}

/**
 * A module's contribution to a point by file, as `contributions.gen.ts` lists it: the file's default
 * export is `Loaded` (a slot's component, a table's bulk actions, a list's columns), loaded when used
 * (`loadContributions()`), so a tenant without the module doesn't download it. Its constructors
 * (`slotContribution()`, …) hold `Loaded` to the point's types.
 */
interface Contribution<Loaded> {
	/** `<module>/<point id>`, and `/<name>` for a slot's component: its key, for error reports. */
	readonly id: string;
	readonly module: ModuleId;
	/** The point's id. */
	readonly point: string;
	readonly load: () => Promise<{ default: Loaded }>;
}

/** A point modules contribute to by file: a slot, a form slot, a bulk table, a list's columns. */
interface FilePoint {
	readonly id: string;
	readonly kind: "slot" | "form" | "bulk" | "columns";
}

/** What a contribution to `Point` loads (at a form slot, a component also gets its part's fields). */
type Loads<Point> =
	Point extends BulkTable<infer Row>
		? BulkAction<Row, AnyListWhere>[]
		: Point extends ListColumnsPoint
			? readonly ModuleListColumn[]
			: Point extends SlotPoint<infer Props> | FormSlotPoint<infer Props>
				? Component<Props & { fields?: unknown }>
				: never;

/** A contribution, loaded: its file's default export, or the `error` it failed to load with. */
type Loaded<Value> = { readonly id: string; readonly module: ModuleId } & (
	| { readonly value: Value; readonly error?: undefined }
	| { readonly value?: undefined; readonly error: unknown }
);

/**
 * The contributions in `registry` to `point` of the `modules` (the tenant's, `getTenantModules()`),
 * in registry order, loaded. Never rejects: one whose file doesn't load (its chunk fails) is logged
 * and comes with its `error` instead of a `value`, which the caller leaves out
 * (`value ?? []`), or `<ExtensionSlot>` shows as a notice.
 *
 * `modules` may be the query itself (`getTenantModules()`, unawaited), so a component's
 * `$derived(await loadContributions(…))` holds one `await` (see `one-await-per-derived.spec.ts`).
 */
export async function loadContributions<Point extends FilePoint>(
	registry: readonly Contribution<unknown>[],
	point: Point,
	modules: readonly string[] | PromiseLike<readonly string[]>,
): Promise<Loaded<Loads<Point>>[]> {
	const enabled = await modules;
	return Promise.all(
		registry
			.filter((entry) => entry.point === point.id && enabled.includes(entry.module))
			.map(({ id, module, load }) =>
				load().then(
					// A contribution to this point loads what this point takes (`slotContribution()`, …).
					(file) => ({ id, module, value: file.default as Loads<Point> }),
					(error: unknown) => {
						console.error(`The contribution ${id} didn't load.`, error);
						return { id, module, error };
					},
				),
			),
	);
}

/** A module's columns for a list (their definitions and cells). */
export type ColumnsContribution = Contribution<readonly ModuleListColumn[]>;

/**
 * A contribution to some slot, as the registry lists them. A component takes at least its slot's
 * props, so this is the widest: `loadContributions()` narrows it by its point.
 *
 * @public Only the generated `contributions.gen.ts` imports it, which knip doesn't see.
 */
export type AnySlotContribution = Contribution<Component<never>>;

/**
 * A contribution to some table, as the registry lists them; `loadContributions()` narrows it.
 *
 * @public Only the generated `contributions.gen.ts` imports it, which knip doesn't see.
 */
export type AnyBulkContribution = Contribution<BulkAction<never, AnyListWhere>[]>;

/** The `module`'s contribution to `point` (`name`, a slot's component's), loaded with `load`. */
const contribution = <Loaded>(
	point: { readonly id: string },
	module: ModuleId,
	load: () => Promise<{ default: Loaded }>,
	name?: string,
): Contribution<Loaded> => ({
	id: name ? `${module}/${point.id}/${name}` : `${module}/${point.id}`,
	module,
	point: point.id,
	load,
});

/** The module's columns for `list`, as `contributions.gen.ts` lists them. */
export const columnsContribution = (
	list: ListColumnsPoint,
	module: ModuleId,
	load: () => Promise<{ default: readonly ModuleListColumn[] }>,
): ColumnsContribution => contribution(list, module, load);

/**
 * The module's component `name` at `point`, as `contributions.gen.ts` lists it (the generator
 * writes the calls). The component's props are checked against the slot's, so the type check
 * refuses a component that needs props the slot doesn't pass.
 */
export const slotContribution = <Props extends Record<string, unknown>>(
	point: SlotPoint<Props>,
	module: ModuleId,
	name: string,
	load: () => Promise<{ default: Component<NoInfer<Props>> }>,
) => contribution(point, module, load, name);

/** The props of a form slot's components, given their module's part's schema. */
type FormSlotProps<Point, Part extends FormPartSchema> =
	Point extends FormSlotPoint<infer Props> ? Props & { fields: FormPartFields<Part> } : never;

/**
 * The module's component `name` at the form slot `point`, as `contributions.gen.ts` lists it, with
 * the types of the point and of the module's part's schema (`form-parts/<point id>.ts`). The
 * component's props are checked against the slot's and its part's fields, so the type check refuses
 * a component whose fields don't match its part's schema.
 *
 * @public Only the generated `contributions.gen.ts` imports it, which knip doesn't see.
 */
export const formSlotContribution = <
	Point extends FormSlotPoint<Record<string, unknown>>,
	Part extends FormPartSchema,
>(
	point: Point,
	module: ModuleId,
	name: string,
	load: () => Promise<{ default: Component<FormSlotProps<Point, Part>> }>,
) => contribution(point, module, load, name);

/** The module's bulk actions for `table`, as `contributions.gen.ts` lists them, checked against its rows. */
export const bulkContribution = <Row>(
	table: BulkTable<Row>,
	module: ModuleId,
	load: () => Promise<{ default: BulkAction<NoInfer<Row>, AnyListWhere>[] }>,
) => contribution(table, module, load);
