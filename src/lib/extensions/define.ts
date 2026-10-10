/**
 * Extension points: the places where modules take part in their owner's pages and logic. The
 * owner (core, in `#lib/<domain>/extensions.ts`, or a module, in its `api/extensions.ts`) declares
 * each as a typed value whose id starts with the owner's id and is a string literal, e.g.
 * `defineCollector<In, Out>("orders.adjustPrices", { onError: "fail" })`, which `scripts/modules.ts`
 * reads without running the file. Isomorphic: a point is only its id and kind (its types ride along
 * for the compiler).
 *
 * - Hooks (collectors, events, votes): modules contribute with `contribute()` in their
 *   `server/index.ts`, and the owner calls them with `collect()`, `emit()` or `vote()`, all in
 *   `#lib/server/extensions.ts`, which also says how each kind runs.
 * - Slots and bulk tables: modules contribute by file, a component at
 *   `src/modules/<id>/slots/<point id>/<name>.svelte` and bulk actions as the default export of
 *   `src/modules/<id>/bulk-actions/<point id>.ts`. The generator lists them in
 *   `contributions.gen.ts` with `slotContribution()` and `bulkContribution()`, which hold each to
 *   its point's types.
 */
import type { Component } from "svelte";

import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";
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

/** Declares a collector: contributors answer with `Out` about `In`. */
export const defineCollector = <In, Out>(
	id: string,
	{ onError }: { onError: OnError },
): CollectorPoint<In, Out> => ({ id, kind: "collector", onError });

/** Declares an event, told `Payload` after commit. */
export const defineEvent = <Payload>(id: string): EventPoint<Payload> => ({ id, kind: "event" });

/** Declares a vote about `In`. */
export const defineVote = <In>(id: string): VotePoint<In> => ({ id, kind: "vote" });

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

/** Declares a slot, whose components get `Props`. */
export const defineSlot = <Props extends Record<string, unknown>>(
	id: string,
): SlotPoint<Props> => ({
	id,
	kind: "slot",
});

/** Declares a table that modules add bulk actions to, for its `Row`s. */
export const defineBulkTable = <Row>(id: string): BulkTable<Row> => ({ id, kind: "bulk" });

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

/** The module's bulk actions for `table`, as `contributions.gen.ts` lists them, checked against its rows. */
export const bulkContribution = <Row>(
	table: BulkTable<Row>,
	module: ModuleId,
	load: () => Promise<{ default: BulkAction<NoInfer<Row>, AnyListWhere>[] }>,
): BulkContribution<Row> => ({ id: `${module}/${table.id}`, module, point: table.id, load });
