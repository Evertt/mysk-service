/**
 * Work the app does by itself, with no one signed in: the daily jobs (`runDaily()`,
 * `#lib/server/jobs/daily.ts`). `asSystem(tenant, work)` runs `work` as the system in `tenant`, so
 * the code it calls works as it does in a member's request: `requireTenant()` and the helpers
 * built on it (`inTenant()`, `currentTenant()`, `collect()`, `nextNumber()`, `createOrders()`)
 * answer with that tenant, and `recordActivity()` logs the change as the system's (no user, read
 * as "Fieldworks (automatic)" in the log). In an AsyncLocalStorage, like the request's time zone,
 * so organizations can be worked through one after another (or side by side) in one request.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { User } from "better-auth";

import type { Tenant } from "./session.ts";

const systemRuns = new AsyncLocalStorage<Tenant>();

/**
 * The system as a user: not a row of the `user` table, so it's never stored as one (the log keeps
 * no user for it, see `recordActivity()`), and a query by its id finds nothing.
 */
export const systemUser: User = {
	id: "system",
	name: "",
	email: "",
	emailVerified: false,
	image: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};

/** Whether `user` is the system (`asSystem()`), rather than someone signed in. */
export const isSystemUser = (user: { id: string }) => user.id === systemUser.id;

/** Runs `work` as the system in `tenant` (see above). */
export const asSystem = <T>(tenant: Tenant, work: () => T): T => systemRuns.run(tenant, work);

/** The tenant the system works in right now (`asSystem()`), if it does. */
export const systemTenant = () => systemRuns.getStore();
