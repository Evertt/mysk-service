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
 */
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
	{ id: "admin", label: "Owner or admin" },
	{ id: "planner", label: "Planner (a member)" },
	{ id: "engineer", label: "Field engineer" },
	{ id: "customer", label: "Customer's contact" },
	{ id: "bare", label: "Signed in, no organization" },
	{ id: "anonymous", label: "Signed out" },
] as const;

export type CallerId = (typeof callers)[number]["id"];

const everyone = callers.map((caller) => caller.id);
const members = ["admin", "planner", "engineer", "customer"] as const;

export const gates: readonly {
	name: GateName;
	/** Whom it admits, in a sentence. */
	admits: string;
	/** What it is used for. */
	forWhat: string;
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
		admits: "A signed-in member of the organization who isn't a field engineer: the office.",
		forWhat: "Almost everything.",
		check: "requireMember",
		reaches: ["admin", "planner"],
	},
	{
		name: "forManagers",
		admits: "An owner or admin of the organization.",
		forWhat: "The organization's settings.",
		check: "requireManager",
		reaches: ["admin"],
	},
	{
		name: "forEngineers",
		admits: "A user linked to an engineer record.",
		forWhat: "The engineer portal.",
		check: "requireEngineer",
		reaches: ["engineer"],
	},
	{
		name: "forCustomers",
		admits: "A customer's contact, linked to one of the organization's customers.",
		forWhat: "The customer portal; handlers scope every query to that customer and its sites.",
		check: "requireCustomer",
		reaches: ["customer"],
	},
	{
		name: "forAnyRole",
		admits: "Any member of the organization, field engineers and customers' contacts too.",
		forWhat: "What every shell needs, such as the app shell's tenant.",
		check: "requireTenant",
		reaches: members,
	},
	{
		name: "forUsers",
		admits: "Anyone signed in, with or without an organization.",
		forWhat: "Functions that touch no tenant data.",
		check: "requireUser",
		reaches: [...members, "bare"],
	},
	{
		name: "forDevelopers",
		admits: "A signed-in user whose email is in DEVELOPER_EMAILS, across tenants.",
		forWhat: "The bug reports' pages. A 404 for everyone else.",
		check: "requireDeveloper",
		reaches: [],
	},
	{
		name: "forAnyone",
		admits: "Everyone, signed in or not.",
		forWhat: "What is public on purpose: signing in, the theme, an invitation's link.",
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
