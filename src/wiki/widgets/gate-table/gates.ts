/**
 * The gated sets of remote functions (`src/lib/server/remote-functions.ts`) and whom each admits,
 * for `<GateTable>`, worded from the project instructions' "Tenancy". `gates.spec.ts` reads that
 * file and fails when a gate here isn't exported there (or the other way round), and reads the
 * checks' names from the auth files, so a renamed or new gate can't leave this table behind. The
 * module sets are a function, not a set, so the page explains them instead.
 *
 * The table is documentation: it says who gets through as data (`reaches`), and holds no role logic
 * of its own. It names each gate's check as the app does (`requireMember`), and never imports or
 * calls one: the guard that keeps `requireEngineer` to the auth files lets this file name it
 * (`engineer-scope.spec.ts`).
 *
 * Every text is a message function, read where it is shown (`gate-table.svelte`).
 */
import { m } from "#lib/paraglide/messages.js";

type GateName =
	| "forMembers"
	| "forManagers"
	| "forEngineers"
	| "forCustomers"
	| "forAnyRole"
	| "forUsers"
	| "forDevelopers"
	| "forAnyone";

/** Who may be calling, for the table's picker. */
export const callers = [
	{ id: "admin", label: m.wiki_gate_caller_admin },
	{ id: "planner", label: m.wiki_gate_caller_planner },
	{ id: "engineer", label: m.wiki_gate_caller_engineer },
	{ id: "customer", label: m.wiki_gate_caller_customer },
	{ id: "bare", label: m.wiki_gate_caller_bare },
	{ id: "anonymous", label: m.wiki_gate_caller_anonymous },
] as const;

export type CallerId = (typeof callers)[number]["id"];

const everyone = callers.map((caller) => caller.id);
const members = ["admin", "planner", "engineer", "customer"] as const;

export const gates: readonly {
	name: GateName;
	/** Whom it admits, in a sentence. */
	admits: () => string;
	/** What it is used for. */
	forWhat: () => string;
	/** The check it runs before the handler, by its name in the app; `null` for none. */
	check:
		| "requireMember"
		| "requireManager"
		| "requireEngineer"
		| "requireCustomer"
		| "requireTenant"
		| "requireUser"
		| "requireDeveloper"
		| null;
	/** The callers it lets through (a field engineer is linked to an engineer record). */
	reaches: readonly CallerId[];
}[] = [
	{
		name: "forMembers",
		admits: m.wiki_gate_members_admits,
		forWhat: m.wiki_gate_members_for,
		check: "requireMember",
		reaches: ["admin", "planner"],
	},
	{
		name: "forManagers",
		admits: m.wiki_gate_managers_admits,
		forWhat: m.wiki_gate_managers_for,
		check: "requireManager",
		reaches: ["admin"],
	},
	{
		name: "forEngineers",
		admits: m.wiki_gate_engineers_admits,
		forWhat: m.wiki_gate_engineers_for,
		check: "requireEngineer",
		reaches: ["engineer"],
	},
	{
		name: "forCustomers",
		admits: m.wiki_gate_customers_admits,
		forWhat: m.wiki_gate_customers_for,
		check: "requireCustomer",
		reaches: ["customer"],
	},
	{
		name: "forAnyRole",
		admits: m.wiki_gate_any_role_admits,
		forWhat: m.wiki_gate_any_role_for,
		check: "requireTenant",
		reaches: members,
	},
	{
		name: "forUsers",
		admits: m.wiki_gate_users_admits,
		forWhat: m.wiki_gate_users_for,
		check: "requireUser",
		reaches: [...members, "bare"],
	},
	{
		name: "forDevelopers",
		admits: m.wiki_gate_developers_admits,
		forWhat: m.wiki_gate_developers_for,
		check: "requireDeveloper",
		reaches: [],
	},
	{
		name: "forAnyone",
		admits: m.wiki_gate_anyone_admits,
		forWhat: m.wiki_gate_anyone_for,
		check: null,
		reaches: everyone,
	},
];

/** What a gate does with a caller: lets the call through, or refuses it with a status. */
type Outcome = { admitted: true } | { admitted: false; status: 401 | 403 | 404 };

/**
 * What `gate` does with a call of `caller`: the call goes through if the gate reaches the caller;
 * else a call without a session is a 401, one with the wrong role or without an organization a 403,
 * and the developers' gate a 404 (it says nothing of its pages).
 */
export function outcome(gate: GateName, caller: CallerId): Outcome {
	const found = gates.find((candidate) => candidate.name === gate);
	if (found?.reaches.includes(caller)) return { admitted: true };
	if (caller === "anonymous") return { admitted: false, status: 401 };
	return { admitted: false, status: gate === "forDevelopers" ? 404 : 403 };
}

/** A gate's check as it's called, e.g. `requireMember()`, or `none`. */
export const checkCall = (check: (typeof gates)[number]["check"]) =>
	check ? `${check}()` : "none";
