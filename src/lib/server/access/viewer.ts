/**
 * Who is asking, as the gate that admitted the request saw them: the office, a field engineer, a
 * customer's contact or the system. A gated set (`#lib/server/remote-functions.ts`) records the
 * audience it admits once its gate lets a call through (`admitAs()`), and `viewer()` reads it, so a
 * member who is both an admin and an engineer is the engineer in a `forEngineers` function and the
 * office in a `forMembers` one. Outside a gate (a page's load, a hook), and in a set that admits any
 * role, the stronger role decides, as the page guard has it (`shellOf()`).
 */
import { getRequestEvent } from "$app/server";

import { isManager } from "#lib/auth/roles.ts";
import { type ShellName, shellOf } from "#lib/auth/shells.ts";
import {
	currentCustomer,
	type CustomerAccess,
	requireTenant,
	systemTenant,
} from "#lib/server/auth/index.ts";

/** Whose records the request reads: the shell it works in, or the system's (the daily jobs). */
export type Audience = ShellName | "system";

/** What a gated set admits: one audience, or whichever the member's roles make (`forAnyRole`). */
export type Admits = Audience | "by-role";

/** Who is asking. The engineer's id stays in `#lib/server/auth/engineer.ts`. */
export type Viewer =
	| { audience: "office"; manager: boolean }
	| { audience: "engineer" }
	| { audience: "customer"; access: CustomerAccess }
	| { audience: "system" };

const admitted = new WeakMap<object, Audience>();

/** Records the audience the gate admitted for the current request (`"by-role"`: none). */
export function admitAs(admits: Admits) {
	const event = getRequestEvent();
	if (admits === "by-role") admitted.delete(event);
	else admitted.set(event, admits);
}

/** The audience of the current request: the gate's, else the member's strongest role's. */
export function audienceOf(): Audience {
	if (systemTenant()) return "system";
	return admitted.get(getRequestEvent()) ?? shellOf(requireTenant().roles).name;
}

/** Who is asking, in a request with a tenant (`requireTenant()`) or as the system. */
export async function viewer(): Promise<Viewer> {
	const audience = audienceOf();
	switch (audience) {
		case "office":
			return { audience, manager: isManager(requireTenant().roles) };
		case "customer":
			return { audience, access: await currentCustomer() };
		default:
			return { audience };
	}
}

/**
 * The request's viewer, if it is `audience`'s: for a scope maker named by its audience (the work
 * record's `engineerWork()`, the units' `officeUnits()`), which asks the registry as that
 * audience. A request of another audience (a gate that admits it, or the system) is refused, so
 * the scope of one audience is never read as another's.
 */
export async function viewerAs<A extends "office" | "engineer">(
	audience: A,
): Promise<Extract<Viewer, { audience: A }>> {
	const asking = await viewer();
	if (asking.audience !== audience) {
		throw new Error(`A ${audience} scope was asked for in a request of the ${asking.audience}`);
	}
	return asking as Extract<Viewer, { audience: A }>;
}
