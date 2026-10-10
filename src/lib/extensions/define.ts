/**
 * Extension points: the places where modules take part in their owner's logic. The owner (core,
 * in `#lib/<domain>/extensions.ts`, or a module, in its `api/extensions.ts`) declares each as a
 * typed value whose id starts with the owner's id and is a string literal, e.g.
 * `defineCollector<In, Out>("orders.adjustPrices", { onError: "fail" })`. Isomorphic: a point is
 * only its id and kind (its types ride along for the compiler). Modules contribute to a hook with
 * `contribute()`, and its owner calls it with `collect()`, `emit()` or `vote()`, all in
 * `#lib/server/extensions.ts`, which also says how each kind runs.
 */

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
