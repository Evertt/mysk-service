/**
 * Extension points: the places where modules take part in their owner's pages and logic. The
 * owner (core, in `#lib/<domain>/extensions.ts`, or a module, in its `api/extensions.ts`) declares
 * each as a typed value whose id starts with the owner's id and is a string literal, e.g.
 * `defineCollector<In, Out>("orders.adjustPrices", { onError: "fail" })`, which `scripts/modules.ts`
 * reads without running the file. Isomorphic: a point is only its id and kind (its types ride along
 * for the compiler).
 *
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

/** Declares a collector: contributors answer with `Out` about `In`. */
export const defineCollector = <In, Out>(
	id: string,
	{ onError }: { onError: OnError },
): CollectorPoint<In, Out> => ({ id, kind: "collector", onError });

/** Declares an event, told `Payload` after commit. */
export const defineEvent = <Payload>(id: string): EventPoint<Payload> => ({ id, kind: "event" });

/** Declares a vote about `In`. */
export const defineVote = <In>(id: string): VotePoint<In> => ({ id, kind: "vote" });

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

/** Declares a server-side list that modules add columns to. */
export const defineListColumns = (id: string): ListColumnsPoint => ({ id, kind: "columns" });

/** A module's columns for a list (their definitions and cells), loaded like a slot's component. */
export interface ColumnsContribution {
	/** `<module>/<point id>`, for error reports. */
	readonly id: string;
	readonly module: ModuleId;
	/** The list's id. */
	readonly point: string;
	readonly load: () => Promise<{ default: readonly ModuleListColumn[] }>;
}

/** The module's columns for `list`, as `contributions.gen.ts` lists them. */
export const columnsContribution = (
	list: ListColumnsPoint,
	module: ModuleId,
	load: () => Promise<{ default: readonly ModuleListColumn[] }>,
): ColumnsContribution => ({ id: `${module}/${list.id}`, module, point: list.id, load });

/** A module's component at a slot. Loaded when shown, so a tenant without the module doesn't download it. */
export interface SlotContribution<Props extends Record<string, unknown>> {
	/** `<module>/<point id>/<name>`, for error reports. */
	readonly id: string;
	readonly module: ModuleId;
	/** The slot's id. */
	readonly point: string;
	readonly load: () => Promise<{ default: Component<Props> }>;
}

/** A module's bulk actions for a table, loaded like a slot's component. */
export interface BulkContribution<Row> {
	/** `<module>/<point id>`, for error reports. */
	readonly id: string;
	readonly module: ModuleId;
	/** The table's id. */
	readonly point: string;
	readonly load: () => Promise<{ default: BulkAction<Row, AnyListWhere>[] }>;
}

/**
 * A contribution to some slot, as the registry lists them. A component takes at least its slot's
 * props, so this is the widest: narrow it by its `point` before rendering it.
 *
 * @public Only the generated `contributions.gen.ts` imports it, which knip doesn't see.
 */
export type AnySlotContribution = SlotContribution<never>;

/**
 * A contribution to some table, as the registry lists them; narrow it by its `point`.
 *
 * @public Only the generated `contributions.gen.ts` imports it, which knip doesn't see.
 */
export type AnyBulkContribution = BulkContribution<never>;

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
): SlotContribution<Props> => ({
	id: `${module}/${point.id}/${name}`,
	module,
	point: point.id,
	load,
});

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
): SlotContribution<FormSlotProps<Point, Part>> => ({
	id: `${module}/${point.id}/${name}`,
	module,
	point: point.id,
	load,
});

/** The module's bulk actions for `table`, as `contributions.gen.ts` lists them, checked against its rows. */
export const bulkContribution = <Row>(
	table: BulkTable<Row>,
	module: ModuleId,
	load: () => Promise<{ default: BulkAction<NoInfer<Row>, AnyListWhere>[] }>,
): BulkContribution<Row> => ({ id: `${module}/${table.id}`, module, point: table.id, load });
