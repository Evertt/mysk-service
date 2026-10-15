/**
 * The kernel's dispatch of hooks: how the optional modules take part in their owners' server logic
 * without the owner importing them. An owner declares its extension points with
 * `#lib/extensions/define.ts` (core's in `#lib/<domain>/extensions.ts`, e.g. `orders.adjustPrices`;
 * a module's in its `api/extensions.ts`, e.g. `invoices.billableItems`). A module contributes in
 * its `server/index.ts`: `defineServerModule("contracts", [contribute(adjustPrices, …), …])`, the
 * point imported from its owner, so the types follow it. The owner calls each point from one
 * function of its own, e.g. `priceOrders()` (`#lib/orders/server/pricing.ts`), for the modules the
 * current tenant has on; a module that isn't on is never asked.
 *
 * A point is one of these kinds, and keeps to its rules:
 *
 * - Collector (`collect()`): every contributor is asked in parallel, about a batch (a whole list
 *   of orders at once, to keep it to a query or two), and answers for the ones it has something to
 *   say about. The answers come back in registry order. When a contributor throws, the point's
 *   `onError` decides: `fail` fails the request (a broken price must not quietly become a wrong
 *   total), `skip` logs it with the module's id and leaves its answer out (an order's badges).
 * - Event after commit (`emit()`): each contributor is called in registry order once the change is
 *   committed, in the same request (see `afterCommit()` in `#lib/server/db/serialize.ts`). Errors
 *   are logged with the module's id, never thrown: the change is made.
 * - Vote (`vote()`): every contributor is asked whether something may happen, and answers with a
 *   refusal or nothing; any refusal wins. A voter that throws fails the request.
 * - Save hook (`save()`): each contributor saves its part of a change in the owner's transaction
 *   (the input carries it), one after another in registry order, and answers the problems that
 *   keep it from saving, or nothing. The first problems stop the rest; the owner then refuses the
 *   change, which rolls the transaction back. A contributor that throws fails the request (and so
 *   rolls it back too).
 *
 * A module's point is dispatched only while its owner is on (the id's prefix, e.g. `invoices`):
 * otherwise `collect()`, `vote()` and `save()` answer `[]` and `emit()` tells no one.
 *
 * Registry order is dependency order: the modules' `server/index.ts` in `hooks.gen.ts`, each after
 * the modules it requires. Add a point when a module needs one, not before.
 */
import type {
	CollectorPoint,
	EventPoint,
	SaveHookPoint,
	VotePoint,
} from "#lib/extensions/define.ts";
import { type ModuleId, moduleIds } from "#lib/modules/ids.ts";
import { requireTenant } from "#lib/server/auth/session.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";

import { generatedServerModules } from "./modules/hooks.gen.ts";

type AnyPoint =
	| CollectorPoint<unknown, unknown>
	| EventPoint<unknown>
	| VotePoint<unknown>
	| SaveHookPoint<unknown, unknown>;

/** A module's answer to one point, made with `contribute()`. */
export interface Contribution {
	point: AnyPoint;
	answer: (input: never) => unknown;
}

/** A module's contributions to the points of others (core's and the modules' it enhances). */
export interface ServerModule {
	id: ModuleId;
	contributions: Contribution[];
}

/** A module's answer to a collector: its part of the answer about `input`. */
export function contribute<In, Out>(
	point: CollectorPoint<In, Out>,
	answer: (input: In) => Promise<Out>,
): Contribution;
/** A module's handler of an event, called after commit. */
export function contribute<Payload>(
	point: EventPoint<Payload>,
	handler: (payload: Payload) => void | Promise<void>,
): Contribution;
/** A module's voter: a refusal (a message), or `undefined` to allow. */
export function contribute<In>(
	point: VotePoint<In>,
	voter: (input: In) => Promise<string | undefined>,
): Contribution;
/** A module's part of a save: what it saves in the owner's transaction, or the problems in the way. */
export function contribute<In, Problem>(
	point: SaveHookPoint<In, Problem>,
	save: (input: In) => Promise<Problem[] | undefined>,
): Contribution;
export function contribute(point: AnyPoint, answer: (input: never) => unknown): Contribution {
	return { point, answer };
}

/**
 * Declares a module's server contributions: the default export of its `server/index.ts` (`id` is
 * checked against the module registry).
 */
export function defineServerModule(id: ModuleId, contributions: Contribution[]): ServerModule {
	return { id, contributions };
}

/**
 * Whether `point` belongs to a module that isn't among the `enabled`: its id starts with its
 * owner's (`invoices.billableItems`). A point whose prefix is no module's id is the core's.
 */
function ownerIsOff(point: AnyPoint, enabled: readonly string[]) {
	const owner = point.id.split(".")[0];
	return (moduleIds as readonly string[]).includes(owner) && !enabled.includes(owner);
}

/**
 * The answers to `point` of the `enabled` modules, in registry order, each with its module's id;
 * none while the point's owner is off, so a module that only enhances the owner isn't asked even
 * if it calls the owner's point itself. Reads the registry when called, not when loaded: the
 * modules import `contribute()` from here.
 */
function contributionsTo<Answer>(point: AnyPoint, enabled: readonly string[]) {
	if (ownerIsOff(point, enabled)) return [];
	const modules: readonly ServerModule[] = generatedServerModules();
	return modules.flatMap(({ id, contributions }) =>
		enabled.includes(id)
			? contributions.flatMap((contribution) =>
					contribution.point.id === point.id ? [{ id, answer: contribution.answer as Answer }] : [],
				)
			: [],
	);
}

/** Calls `answer`, turning what it throws into a rejection. */
const ask = async <In, Out>(answer: (input: In) => Out | Promise<Out>, input: In) => answer(input);

/**
 * Every answer of the modules that are on (by default the current tenant's) to `point` about
 * `input`, asked in parallel, in registry order. See the point's `onError` for a module that
 * throws.
 */
export async function collect<In, Out>(
	point: CollectorPoint<In, Out>,
	input: In,
	enabled: readonly string[] = requireTenant().modules,
): Promise<Out[]> {
	const contributions = contributionsTo<(input: In) => Promise<Out>>(point, enabled);
	const asked = contributions.map(({ answer }) => ask(answer, input));
	if (point.onError === "fail") return Promise.all(asked);
	const settled = await Promise.allSettled(asked);
	return settled.flatMap((result, i) => {
		if (result.status === "fulfilled") return [result.value];
		console.error(`Module ${contributions[i].id} failed at ${point.id}:`, result.reason);
		return [];
	});
}

/**
 * Tells the modules that are on (by default the current tenant's) about `payload`, in registry
 * order, once the transaction this runs in (if any) has committed. A handler that throws is logged.
 */
export function emit<Payload>(
	point: EventPoint<Payload>,
	payload: Payload,
	enabled: readonly string[] = requireTenant().modules,
): void {
	for (const { id, answer } of contributionsTo<(payload: Payload) => void | Promise<void>>(
		point,
		enabled,
	)) {
		afterCommit(async () => {
			try {
				await answer(payload);
			} catch (error) {
				console.error(`Module ${id} failed at ${point.id}:`, error);
			}
		});
	}
}

/**
 * The refusals of the modules that are on (by default the current tenant's) to `input`, in
 * registry order: empty when it's allowed.
 */
export async function vote<In>(
	point: VotePoint<In>,
	input: In,
	enabled: readonly string[] = requireTenant().modules,
): Promise<string[]> {
	const voters = contributionsTo<(input: In) => Promise<string | undefined>>(point, enabled);
	const answers = await Promise.all(voters.map(({ answer }) => ask(answer, input)));
	return answers.filter((answer) => answer !== undefined);
}

/**
 * Lets the modules that are on (by default the current tenant's) save their part of `input`, one
 * after another in registry order, in the owner's transaction (which `input` carries). Returns the
 * problems of the first that answers any, without asking the rest: the owner then refuses the
 * change. Empty when every module saved its part.
 */
export async function save<In, Problem>(
	point: SaveHookPoint<In, Problem>,
	input: In,
	enabled: readonly string[] = requireTenant().modules,
): Promise<Problem[]> {
	for (const { answer } of contributionsTo<(input: In) => Promise<Problem[] | undefined>>(
		point,
		enabled,
	)) {
		const problems = await answer(input);
		if (problems?.length) return problems;
	}
	return [];
}
