/**
 * The app's three shells, and which one a member works in: the office app, the engineer portal and
 * the customer portal. The one place that knows where a role lands (its shell's `home`) and which
 * pages are its shell's (`owns(routeId)`): the guard (`handleGuard` in `hooks.server.ts`), the
 * office shell's tenant query, the invitations, the demo's sign-in and the QR codes go by it. And
 * the one way to link to the login page and back (`loginUrl()`). Kept out of `$lib/server`, like
 * `roles.ts`, so client code can import it.
 */
import { isCustomerContact, isFieldEngineer } from "./roles.ts";

export type ShellName = "office" | "engineer" | "customer";

export interface Shell {
	name: ShellName;
	/** Where its members start, and where the guard sends them back to from a page not theirs. */
	home: string;
	/** Whether the page of `routeId` (SvelteKit's, `null` for a path no route has) is this shell's. */
	owns(routeId: string | null): boolean;
}

/** Whether `routeId` is in the route group `group`, e.g. `(field)`, a module's pages there too. */
const inGroup = (routeId: string | null, group: string) =>
	routeId?.startsWith(`/${group}/`) ?? false;

/** The QR codes' links (`/q/<token>`), which lead an engineer or a customer's contact into theirs. */
const qrCode = (routeId: string | null) => routeId === "/q/[token]";

export const shells = {
	// Everything but the customer portal: an office member may open the engineer portal too (to see
	// what an engineer sees), and a path no route has is a 404 for them.
	office: { name: "office", home: "/", owns: (routeId) => !inGroup(routeId, "(customer)") },
	engineer: {
		name: "engineer",
		home: "/my",
		owns: (routeId) => inGroup(routeId, "(field)") || qrCode(routeId),
	},
	customer: {
		name: "customer",
		home: "/portal",
		owns: (routeId) => inGroup(routeId, "(customer)") || qrCode(routeId),
	},
} as const satisfies Record<ShellName, Shell>;

/**
 * The shell a member with these roles (in their current organization) works in: a field engineer
 * only in the engineer portal, a customer's contact only in the customer portal, anyone else (an
 * office role, also beside another, or no organization yet) in the office.
 */
export function shellOf(roles: readonly string[]): Shell {
	if (isFieldEngineer(roles)) return shells.engineer;
	if (isCustomerContact(roles)) return shells.customer;
	return shells.office;
}

/** The login page, which leads back to `target` (a path, with its search) after signing in. */
export const loginUrl = (target?: string) =>
	!target || target === "/" ? "/login" : `/login?redirectTo=${encodeURIComponent(target)}`;
