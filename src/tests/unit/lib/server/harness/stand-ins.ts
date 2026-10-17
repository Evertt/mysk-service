/**
 * Stand-ins for SvelteKit's `query`, `form` and `command`, for a spec that calls a remote
 * function's gated handler itself: the gate, then the handler, without SvelteKit's schema
 * validation before them, so any argument reaches the gate. The module-gate spec checks with them
 * that each module's remote functions refuse a tenant without the module, whatever they're sent.
 * A spec swaps them in for SvelteKit's own (keeping `getRequestEvent()` and the rest):
 *
 * ```ts
 * vi.mock("$app/server", async (importOriginal) => ({
 * 	...(await importOriginal<object>()),
 * 	...(await import("#unit/lib/server/harness/stand-ins.ts")).remoteStandIns,
 * }));
 * ```
 *
 * Each stand-in is what SvelteKit's would be to `init_remote_functions()`, which names the exports
 * of a `*.remote.ts` file: an object with `__.type`, here also with what it was made with.
 */

/** What a stand-in remote function was made with: the gated set's handler is the last argument. */
interface StandIn {
	__: { type: string; name: string; id: string };
	made: unknown[];
}

const make =
	(type: string) =>
	(...made: unknown[]): StandIn => ({ __: { type, name: "", id: "" }, made });

/** `query` (with `batch` and `live`), `form` and `command`, as stand-ins (see above). */
export const remoteStandIns = {
	query: Object.assign(make("query"), { batch: make("query_batch"), live: make("query_live") }),
	form: make("form"),
	command: make("command"),
};

/** Whether `value` is a remote function made by a stand-in. */
export const isStandIn = (value: unknown): value is StandIn =>
	typeof value === "object" && value !== null && "made" in value && "__" in value;

/**
 * The handler SvelteKit would call for the stand-in `remote`: the gated set's, which runs the gate
 * and then the remote function's own handler, with the arguments SvelteKit would pass (a form's
 * data and `issue`, a query's or command's argument).
 */
export function gatedHandler(remote: unknown) {
	if (!isStandIn(remote)) throw new Error("Not a remote function made by a stand-in");
	return remote.made.at(-1) as (...args: unknown[]) => unknown;
}
