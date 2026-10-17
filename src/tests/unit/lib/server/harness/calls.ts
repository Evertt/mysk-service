/**
 * Calls remote functions without HTTP, the way SvelteKit's server answers a call from the
 * browser: SvelteKit's own `query`, `query.batch`, `query.live`, `command` and `form` run (their
 * schema validation, then the gated set's gate, then the handler), in a request of the current
 * visitor (`as()` in `request.ts`) made for the call, and the answer is what the client would get:
 *
 * - `{ status: 200, data }`: what a query or command answered (a live query's first value), or a
 *   form's result;
 * - `{ status: 400, issues }`: a form refused, by its schema or the handler's `invalid()` (SvelteKit
 *   sends those with the form's result, which the client shows on its fields; a 400 here, so any
 *   refusal is a status other than 200). A query's or command's argument that its schema refuses
 *   is a 400 too, with the issues the client doesn't get;
 * - `{ status, message }`: an `error(…)` (a 404 for another tenant's id, a 403 for a role the set
 *   refuses);
 * - `{ status, location }`: a `redirect(…)`.
 *
 * A command's or form's answer also names the queries it refreshed (`getX(…).refresh()` or
 * `.set()`), which the client gets with it. Nothing was requested to be refreshed (the client's
 * `updates()`), so `requested()` finds nothing. Any other error is thrown, as a failing spec should.
 */
import type {
	RemoteCommand,
	RemoteForm,
	RemoteFormInput,
	RemoteLiveQueryFunction,
	RemoteQueryFunction,
} from "$app/server";
import { isHttpError, isRedirect, isValidationError } from "@sveltejs/kit";

import { inRequest, type RequestFlags, type RequestState } from "./request.ts";

/** A form's or a schema's issue, as SvelteKit sends it to the client. */
interface Issue {
	/** The field's name, e.g. `customerId` or `units[0].id` (empty for the whole form). */
	name: string;
	path: (string | number)[];
	message: string;
}

/** What the client gets for a call (see above). */
export interface Answer<T> {
	status: number;
	data?: T;
	issues?: Issue[];
	message?: string;
	location?: string;
	/** The names of the queries a command or form refreshed, e.g. `["getOrder"]`. */
	refreshed?: string[];
}

/** SvelteKit's internals of a remote function (`fn.__`). */
interface Internals {
	type: "query" | "query_batch" | "query_live" | "command" | "form" | "prerender";
	fn?: (data: unknown, meta: object, formData: null) => Promise<FormOutput>;
}

interface FormOutput {
	result?: unknown;
	issues?: (Issue & { server: boolean })[];
}

/** A query, batch query, live query or command, as `call()` takes it. */
type Callable<A, T> =
	| RemoteQueryFunction<A, T>
	| RemoteLiveQueryFunction<A, T>
	| RemoteCommand<A, T>;

/** The argument of a callable: optional when it takes none. */
type ArgOf<A> = undefined extends A ? [arg?: A] : [arg: A];

const internalsOf = (remote: unknown) => (remote as { __?: Internals }).__;

/**
 * Calls the query (also a batch or live one) or command `remote` with `arg`, as the client would
 * (see above). A live query answers with its first value; its watch ends with the request.
 */
export function call<A, T>(
	remote: Callable<A, T>,
	...[arg]: ArgOf<NoInfer<A>>
): Promise<Answer<Awaited<T>>> {
	const internals = internalsOf(remote);
	if (!internals || internals.type === "form" || internals.type === "prerender") {
		throw new Error("call() takes a query or a command; a form goes to submit()");
	}
	const command = internals.type === "command";
	const flags: RequestFlags = command ? { is_in_remote_form_or_command: true } : {};
	return answer(command, (seen) =>
		inRequest(command ? "POST" : "GET", flags, async (_, state) => {
			seen(state);
			const called = (remote as (arg: A | undefined) => PromiseLike<T>)(arg);
			return { status: 200, data: (await called) as Awaited<T> };
		}),
	);
}

/**
 * Submits `data` to the form `form` (or a keyed one's `form.for(key)`), as an enhanced form does:
 * `data` is the form's fields as the client parsed them, before the schema has seen them.
 */
export function submit<Input extends RemoteFormInput | void, Output>(
	form: RemoteForm<Input, Output>,
	data: NoInfer<Input> | Record<string, unknown>,
): Promise<Answer<Output>> {
	const internals = internalsOf(form);
	if (internals?.type !== "form" || !internals.fn) throw new Error("submit() takes a form");
	const run = internals.fn;
	return answer(true, (seen) =>
		inRequest("POST", { is_in_remote_form_or_command: true }, async (_, state) => {
			seen(state);
			const output = await run(data, {}, null);
			if (!output.issues) return { status: 200, data: output.result as Output };
			const issues = output.issues.map(({ name, path, message }) => ({ name, path, message }));
			return { status: 400, issues };
		}),
	);
}

/**
 * The data a query or command answers, for a call that should succeed (else it fails, naming what
 * the client got instead): `const { rows } = await data(getOrders, query)`.
 */
export async function data<A, T>(
	remote: Callable<A, T>,
	...args: ArgOf<NoInfer<A>>
): Promise<Awaited<T>> {
	const answered = await call(remote, ...args);
	if (answered.status !== 200) throw new Error(`Expected data, got ${JSON.stringify(answered)}`);
	return answered.data as Awaited<T>;
}

/**
 * The answer for what `run` answered or threw; for a command or form (`changes`) that wasn't
 * refused, with the queries it refreshed (in the request state `run` hands to `seen`).
 */
async function answer<T>(
	changes: boolean,
	run: (seen: (state: RequestState) => void) => Promise<Answer<T>>,
): Promise<Answer<T>> {
	let state: RequestState | undefined;
	const withRefreshes = (answered: Answer<T>): Answer<T> => {
		if (!changes || answered.issues) return answered;
		const refreshed = [...(state?.remote.explicit?.values() ?? [])].map(
			({ internals }) => internals.name,
		);
		return { ...answered, refreshed };
	};
	try {
		return withRefreshes(await run((seen) => (state = seen)));
	} catch (thrown) {
		if (isHttpError(thrown)) return { status: thrown.status, message: thrown.body.message };
		if (isRedirect(thrown)) {
			return withRefreshes({ status: thrown.status, location: thrown.location });
		}
		if (isValidationError(thrown)) {
			const issues = thrown.issues.map((issue) => {
				const path = (issue.path ?? []).map(keyOf);
				return { name: path.join("."), path, message: issue.message };
			});
			return { status: 400, message: "Bad Request", issues };
		}
		throw thrown;
	}
}

const keyOf = (segment: PropertyKey | { key: PropertyKey }) =>
	(typeof segment === "object" ? segment.key : segment) as string | number;
