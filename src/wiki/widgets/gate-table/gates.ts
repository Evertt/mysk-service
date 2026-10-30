/**
 * The gated sets of remote functions (`src/lib/server/remote-functions.ts`) and whom each admits,
 * for `<GateTable>`, worded from the project instructions' "Tenancy". `gates.spec.ts` reads that
 * file and fails when a gate here isn't exported there (or the other way round), so a renamed or
 * new gate can't leave this table behind. `moduleRemote(id)` is a function, not a set, so it's
 * explained on the page instead.
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

export const gates: readonly {
	name: GateName;
	/** Whom it admits, in a sentence. */
	admits: string;
	/** What it is used for. */
	forWhat: string;
	/** The check it runs before the handler. */
	check: string;
}[] = [
	{
		name: "forMembers",
		admits: "A signed-in member of the organization who isn't a field engineer: the office.",
		forWhat: "Almost everything.",
		check: "requireMember()",
	},
	{
		name: "forManagers",
		admits: "An owner or admin of the organization.",
		forWhat: "The organization's settings.",
		check: "requireManager()",
	},
	{
		name: "forEngineers",
		admits: "A user linked to an engineer record.",
		forWhat: "The engineer portal.",
		check: "requireEngineer()",
	},
	{
		name: "forCustomers",
		admits: "A customer's contact, linked to one of the organization's customers.",
		forWhat: "The customer portal; handlers scope every query to that customer and its sites.",
		check: "requireCustomer()",
	},
	{
		name: "forAnyRole",
		admits: "Any member of the organization, field engineers and customers' contacts too.",
		forWhat: "What every shell needs, such as the app shell's tenant.",
		check: "requireTenant()",
	},
	{
		name: "forUsers",
		admits: "Anyone signed in, with or without an organization.",
		forWhat: "Functions that touch no tenant data.",
		check: "requireUser()",
	},
	{
		name: "forDevelopers",
		admits: "A signed-in user whose email is in DEVELOPER_EMAILS, across tenants.",
		forWhat: "The bug reports' pages. A 404 for everyone else.",
		check: "requireDeveloper()",
	},
	{
		name: "forAnyone",
		admits: "Everyone, signed in or not.",
		forWhat: "What is public on purpose: signing in, the theme, an invitation's link.",
		check: "none",
	},
];

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

/** What a gate does with a caller: lets the call through, or refuses it with a status. */
type Outcome = { admitted: true } | { admitted: false; status: 401 | 403 | 404 };

const admitted: Outcome = { admitted: true };

/**
 * What `gate` does with a call of `caller`, as the checks in `src/lib/server/auth/session.ts` do:
 * a call without a session is a 401 wherever a session is needed, one without an organization or
 * with the wrong role a 403 (a 404 for the developers' gate, which says nothing of its pages).
 * The caller who is a field engineer is linked to an engineer record, as the engineer portal needs.
 */
export function outcome(gate: GateName, caller: CallerId): Outcome {
	if (gate === "forAnyone") return admitted;
	if (caller === "anonymous") return { admitted: false, status: 401 };
	if (gate === "forUsers") return admitted;
	if (gate === "forDevelopers") return { admitted: false, status: 404 };
	if (caller === "bare") return { admitted: false, status: 403 };
	switch (gate) {
		case "forAnyRole":
			return admitted;
		case "forMembers":
			return caller === "admin" || caller === "planner"
				? admitted
				: { admitted: false, status: 403 };
		case "forManagers":
			return caller === "admin" ? admitted : { admitted: false, status: 403 };
		case "forEngineers":
			return caller === "engineer" ? admitted : { admitted: false, status: 403 };
		case "forCustomers":
			return caller === "customer" ? admitted : { admitted: false, status: 403 };
	}
}
