/**
 * The only way to make a remote function: `query`, `form` and `command` (with `query.batch` and
 * `query.live`) come in sets, each gated by who may call it, so a remote function can't forget its
 * check. The gate runs before the handler, on every call (after SvelteKit has validated the
 * argument); when it refuses (a 401, 403 or 404), the handler never runs.
 *
 * ```ts
 * export const getOrder = forMembers.query(v.string(), async (number) => {
 * 	const { organizationId } = currentTenant();
 * 	…
 * });
 * ```
 *
 * - `forMembers`: the office, a signed-in member of the current organization who isn't a field
 *   engineer (`requireMember()`). Almost everything.
 * - `forManagers`: an owner or admin (`requireManager()`), for the organization's settings.
 * - `forEngineers`: the engineer portal, a user linked to an engineer record (`requireEngineer()`).
 * - `forCustomers`: the customer portal, a customer's contact (`requireCustomer()`), whose handlers
 *   scope every query to that customer (and its sites they see) as well as the tenant.
 * - `forAnyRole`: any member, field engineers too (`requireTenant()`); the app shell's tenant.
 * - `forUsers`: signed in, with or without an organization (`requireUser()`).
 * - `forDevelopers`: the developers, signed-in users whose email is in `DEVELOPER_EMAILS`
 *   (`requireDeveloper()`), across tenants: the bug reports' pages. A 404 for everyone else.
 * - `forAnyone`: public on purpose (signing in, the theme, an invitation's link).
 * - `moduleRemote(id)`: an optional module's (`requireModule(id)`), only in its
 *   `remote-functions.ts`.
 *
 * The handler reads what the gate admitted with `currentTenant()`, `currentUser()`,
 * `currentEngineer()` and `currentCustomer()` (`#lib/server/auth`), which don't check a role again.
 *
 * `remote-functions.spec.ts` checks that nothing else imports these from `$app/server`, and that
 * each module builds its remote functions from its own set. There's no `prerender`: nothing here is
 * the same for every tenant. (Not `remote.ts`: SvelteKit takes any `remote.*` file for a remote
 * module, whose exports must all be remote functions.)
 */
import { command, form, query } from "$app/server";

import type { ModuleId } from "#lib/modules/ids.ts";
import {
	requireCustomer,
	requireEngineer,
	requireManager,
	requireMember,
	requireModule,
	requireTenant,
	requireUser,
} from "#lib/server/auth/index.ts";
import { requireDeveloper } from "#lib/server/bug-reports/developers.ts";

/** A remote function set, typed as SvelteKit's own so every overload and field type carries over. */
interface RemoteSet {
	query: typeof query;
	form: typeof form;
	command: typeof command;
}

/** Admits the request or refuses it by throwing (`error(…)`), or with a promise that rejects. */
type Gate = () => unknown;

/** Any of SvelteKit's `query`, `form`, …, as called here: the handler is the last argument. */
type Make = (...args: unknown[]) => unknown;

/**
 * `make` (`query`, `form`, …) with its handler, always the last argument, run after `gate`. Typed
 * as `make` itself, so every overload and the types it infers carry over.
 */
function gated<F>(make: F, gate: Gate): F {
	const wrapped: Make = (...args) => {
		const handler = args.pop() as (...handlerArgs: unknown[]) => unknown;
		const guardedHandler = (...handlerArgs: unknown[]) => {
			const admitted = gate();
			// A gate that answers right away (all but the engineer's and the customer's) leaves the handler's start
			// synchronous, as SvelteKit calls it.
			return admitted instanceof Promise
				? admitted.then(() => handler(...handlerArgs))
				: handler(...handlerArgs);
		};
		return (make as Make)(...args, guardedHandler);
	};
	return wrapped as F;
}

/** The remote function set whose calls `gate` admits. */
export function remoteSet(gate: Gate): RemoteSet {
	const gatedQuery = Object.assign(gated(query, gate), {
		// The gate runs once per batch, before the handler that answers all of its calls.
		batch: gated(query.batch, gate),
		// The gate runs once per connection, before the handler starts the stream.
		live: gated(query.live, gate),
	});
	return { query: gatedQuery, form: gated(form, gate), command: gated(command, gate) };
}

export const forMembers = remoteSet(requireMember);
export const forManagers = remoteSet(requireManager);
export const forEngineers = remoteSet(requireEngineer);
export const forCustomers = remoteSet(requireCustomer);
export const forAnyRole = remoteSet(requireTenant);
export const forUsers = remoteSet(requireUser);
export const forDevelopers = remoteSet(requireDeveloper);
export const forAnyone = remoteSet(() => {});

/** Who may call a module's remote functions, besides the tenant having the module. */
type ModuleRole = "member" | "manager" | "engineer" | "customer";

/**
 * The remote function set of an optional module: refused with a 404 for tenants without the
 * module, as if it didn't exist (`requireModule()`), and with a 403 for those who aren't
 * managers when `role` is `"manager"`; with `"engineer"`, for the engineer portal: only users linked
 * to an engineer (`requireEngineer()`); with `"customer"`, for the customer portal: only customers'
 * contacts (`requireCustomer()`), whose handlers scope what they read to `currentCustomer()`. A
 * module calls it once, in its `remote-functions.ts`, with its own id:
 *
 * ```ts
 * export const { query, form, command } = moduleRemote("invoices");
 * export const forManagers = moduleRemote("invoices", "manager");
 * ```
 */
export function moduleRemote(id: ModuleId, role: ModuleRole = "member"): RemoteSet {
	return remoteSet(() => {
		if (role === "engineer") {
			requireModule(id, { anyRole: true });
			return requireEngineer();
		}
		if (role === "customer") {
			requireModule(id, { anyRole: true });
			return requireCustomer();
		}
		requireModule(id);
		if (role === "manager") requireManager();
	});
}
