/**
 * Guards for the access rules (`#lib/server/access/`), whose behaviour is in
 * `access/matrix.spec.ts` and each module's `tests/unit/server/access.spec.ts`:
 *
 * 1. every logged type has a rule: the core's entries are the core's subject types, and each
 *    module's are its own `subjects`, no more, no fewer (a new type nobody wrote a rule for fails
 *    here, and the types check too), so together they are `everyLoggedType()`.
 * 2. record-generic code asks the registry: a file that imports `recordChangedAt`, `liveFeed`,
 *    `watchEvery` or the `activity` table, or whose remote functions take a `v.picklist(loggedTypes)`
 *    input, also imports `#lib/server/access/index.ts`. `infrastructure` lists the files that
 *    legitimately don't, each with its reason.
 * 3. no hand-written module check: `subjectTypes(allModules)` or `in subjectTypes(` in a
 *    `*.remote.ts` is refused (`readOrNotFound()` answers it, a type of a module that's off having
 *    no rule).
 *
 * The checks also run on made-up files, to show they find what they should.
 *
 * Runs in the server harness only because the modules' server halves import the remote functions.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { getTableName } from "drizzle-orm";
import { describe, expect, test } from "vite-plus/test";

import { coreSubjectTypes, everyLoggedType } from "#lib/activity/subjects.ts";
import { modules } from "#lib/modules/manifests.ts";
import { coreRules } from "#lib/server/access/core.ts";
import { generatedServerModules } from "#lib/server/modules/hooks.gen.ts";
import { as, north } from "#unit/lib/server/harness/index.ts";

/** The rules a module contributes to `access.rules`, by type (none when it contributes none). */
const rulesOf = (id: string) =>
	generatedServerModules()
		.filter((module) => module.id === id)
		.flatMap(({ contributions }) => contributions)
		.filter(({ point }) => point.id === "access.rules")
		.flatMap(({ answer }) => Object.keys((answer as () => object)()));

const subjectsOf = (module: (typeof modules)[number]) =>
	"subjects" in module ? Object.keys(module.subjects) : [];

describe("every logged type has a rule", () => {
	test("the core's subject types are the core's rules", () => {
		expect(Object.keys(coreRules).toSorted()).toEqual(Object.keys(coreSubjectTypes).toSorted());
	});

	for (const module of modules.filter((each) => subjectsOf(each).length)) {
		test(`the ${module.id} module's subject types are its rules`, async () => {
			const rules = await as(north.owner, () => rulesOf(module.id));
			expect(rules.toSorted()).toEqual(subjectsOf(module).toSorted());
		});
	}

	test("together they cover every type the log names", async () => {
		const covered = await as(north.owner, () => [
			...Object.keys(coreRules),
			...modules.flatMap((module) => rulesOf(module.id)),
		]);
		expect(covered.toSorted()).toEqual(everyLoggedType().toSorted());
	});
});

const root = join(import.meta.dirname, "../../../../..");

interface SourceFile {
	/** Relative to the project root, with `/`. */
	path: string;
	source: string;
}

/**
 * The files that touch the log, the change registry or the feeds without asking the registry, and
 * why. Not a place to add a reader that picks records for a viewer: that asks `#lib/server/access`.
 */
const infrastructure: Record<string, string> = {
	"src/lib/server/activity/log.ts": "writes the entries (`recordActivity()`): no viewer reads here",
	"src/lib/server/changes.ts": "the registry of changes the feeds and `recordChangedAt()` read",
	"src/lib/server/activity/feed.ts": "`present()` shows entries its caller already chose",
	"src/lib/server/notifications/rules.ts": "the rules that pick the bells' entries",
	"src/lib/server/auth/engineer.ts":
		'`engineerActivity()` is scoped to the orders it is handed (`visible("order")`: it can\'t import the registry)',
	"src/routes/(field)/my/portal.remote.ts":
		"`watchFieldChanges` filters through `feedFor()` (`live.ts`), which asks the registry",
	"src/modules/checklists/server/notifications.ts":
		"a notification rule: it picks entries of a fixed type for the bell",
	"src/modules/condition/server/history.ts":
		"the unit history reads entries of three fixed types, of orders its caller read",
	"src/modules/docks/board/board.remote.ts":
		"the dock board reads the `dock` entries of its own module's records, for the office",
};

/** The source without its comments. */
const code = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Whether the file imports `name` (not merely uses or declares it). */
const imports = (text: string, name: string) =>
	new RegExp(`import\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(text);

/** What breaks rules 2 and 3 in `files`, as `path: what`. */
function breaches(files: readonly SourceFile[]) {
	return files.flatMap(({ path, source }) => {
		const text = code(source);
		const found: string[] = [];
		const generic =
			["recordChangedAt", "liveFeed", "watchEvery", "activity"].find((name) =>
				imports(text, name),
			) ??
			(/\bv\.picklist\(\s*loggedTypes\s*\)/.test(text) ? "v.picklist(loggedTypes)" : undefined);
		const asks = /from\s+["']#lib\/server\/access\/index\.ts["']/.test(text);
		if (generic && !asks && !Object.hasOwn(infrastructure, path)) {
			found.push(`${generic} without #lib/server/access`);
		}
		if (
			path.endsWith(".remote.ts") &&
			(/\bsubjectTypes\(\s*allModules\s*\)/.test(text) || /\bin\s+subjectTypes\(/.test(text))
		) {
			found.push("a hand-written module check (subjectTypes)");
		}
		return found.map((what) => `${path}: ${what}`);
	});
}

/** The app's source files (not its tests). */
function sources(): SourceFile[] {
	return readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => posix.join("src", file.split("\\").join("/")))
		.filter((path) => /\.(ts|svelte)$/.test(path) && !/(^|\/)tests\//.test(path))
		.map((path) => ({ path, source: readFileSync(join(root, path), "utf8") }));
}

describe("record-generic code asks the registry", () => {
	test("the app keeps to it", () => {
		const files = sources();
		// It reads the files that matter (an empty scan would pass too).
		expect(files.map((file) => file.path)).toEqual(
			expect.arrayContaining([
				"src/lib/components/activity/activity.remote.ts",
				"src/lib/server/live.ts",
			]),
		);
		expect(breaches(files)).toEqual([]);
	});

	test("every file on the infrastructure list exists and still needs to be there", () => {
		const files = new Map(sources().map((file) => [file.path, code(file.source)]));
		const stale = Object.keys(infrastructure).filter((path) => {
			const text = files.get(path);
			return (
				text === undefined ||
				/from\s+["']#lib\/server\/access\/index\.ts["']/.test(text) ||
				!["recordChangedAt", "liveFeed", "watchEvery", "activity"].some((name) =>
					imports(text, name),
				)
			);
		});
		// `live.ts`, `changes.ts` and `feed.ts` define what the rule is about, not import it.
		const defining = new Set([
			"src/lib/server/live.ts",
			"src/lib/server/changes.ts",
			"src/lib/server/activity/feed.ts",
		]);
		expect(stale.filter((path) => !defining.has(path))).toEqual([]);
	});

	test("finds a remote function that reads the log or the changes on its own", () => {
		const log = {
			path: "src/lib/widgets/log.remote.ts",
			source: `import { activity } from "#lib/server/db/schema.ts";
				export const get = forMembers.query(() => db.select().from(activity));`,
		};
		const changed = {
			path: "src/lib/widgets/changed.remote.ts",
			source: `import { recordChangedAt } from "#lib/server/changes.ts";`,
		};
		const feed = {
			path: "src/modules/widgets/feed.remote.ts",
			source: `import { live, liveFeed } from "#lib/server/live.ts";`,
		};
		const picked = {
			path: "src/lib/widgets/picked.remote.ts",
			source: `const schema = v.object({ type: v.picklist(loggedTypes), id: v.string() });`,
		};
		expect(breaches([log, changed, feed, picked])).toEqual([
			`${log.path}: activity without #lib/server/access`,
			`${changed.path}: recordChangedAt without #lib/server/access`,
			`${feed.path}: liveFeed without #lib/server/access`,
			`${picked.path}: v.picklist(loggedTypes) without #lib/server/access`,
		]);
	});

	test("lets through a file that asks, a comment that names them, and a file that lists", () => {
		const asks = {
			path: "src/lib/widgets/log.remote.ts",
			source: `import { readable } from "#lib/server/access/index.ts";
				import { recordChangedAt } from "#lib/server/changes.ts";`,
		};
		const mentions = {
			path: "src/lib/widgets/doc.ts",
			source: `// reads recordChangedAt and liveFeed
				import { something } from "#lib/server/db/schema.ts"; // not the activity table`,
		};
		const listed = {
			path: "src/lib/server/activity/log.ts",
			source: `import { activity } from "#lib/server/db/schema.ts";`,
		};
		expect(breaches([asks, mentions, listed])).toEqual([]);
	});

	test("finds a hand-written module check in a remote file only", () => {
		const remote = {
			path: "src/lib/widgets/log.remote.ts",
			source: `if (!(type in subjectTypes(modules)) && type in subjectTypes(allModules)) error(404);`,
		};
		const plain = { ...remote, path: "src/lib/widgets/log.ts" };
		const label = {
			path: "src/lib/widgets/filters.remote.ts",
			source: `const types = subjectTypes(modules);`,
		};
		expect(breaches([remote, plain, label])).toEqual([
			`${remote.path}: a hand-written module check (subjectTypes)`,
		]);
	});
});

/*
 * Rule 6, managers by one function: a literal `"owner"`/`"admin"` compared with a role (`=== "owner"`,
 * `.includes("admin")`) is refused outside the files that own roles. Who is a manager is
 * `isManager()` (`#lib/auth/roles.ts`), or the viewer's `manager` in the access registry; the
 * single role-of-its-own question (owner) is `isOwner()` (`members.ts`). It catches `canShareViews`.
 */

/** The files that may compare a literal role, and why. */
const roleOwners: Record<string, string> = {
	"src/lib/auth/roles.ts": "defines the roles and `isManager()`",
	"src/lib/auth/members.ts":
		"the rules of the team: the owner is the one role with rules of its own",
};

const roleComparison = new RegExp(
	[
		`[!=]==?\\s*["'](?:owner|admin)["']`,
		`["'](?:owner|admin)["']\\s*[!=]==?`,
		`\\.includes\\(\\s*["'](?:owner|admin)["']\\s*\\)`,
	].join("|"),
);

/** What breaks rule 6 in `files`, as `path: what`. */
function roleBreaches(files: readonly SourceFile[]) {
	return files.flatMap(({ path, source }) => {
		const found = code(source).match(roleComparison)?.[0];
		return found && !Object.hasOwn(roleOwners, path) ? [`${path}: ${found}`] : [];
	});
}

describe("managers by one function", () => {
	test("the app compares no literal owner or admin role outside the files that own roles", () => {
		const files = sources();
		expect(files.map((file) => file.path)).toEqual(
			expect.arrayContaining(["src/lib/auth/roles.ts", "src/lib/auth/members.ts"]),
		);
		expect(roleBreaches(files)).toEqual([]);
	});

	test("every file on the list exists and still compares a role", () => {
		const files = new Map(sources().map((file) => [file.path, code(file.source)]));
		const stale = Object.keys(roleOwners).filter((path) => {
			const text = files.get(path);
			return text === undefined || (path !== "src/lib/auth/roles.ts" && !roleComparison.test(text));
		});
		expect(stale).toEqual([]);
	});

	test("finds the comparisons of a role with a literal", () => {
		const share = {
			path: "src/lib/widgets/views.ts",
			source: `export const canShare = (roles: readonly string[]) =>
				roles.some((role) => role === "owner" || role === "admin");`,
		};
		const includes = {
			path: "src/lib/widgets/menu.remote.ts",
			source: `if (tenant.roles.includes("admin")) return all;`,
		};
		const reversed = {
			path: "src/lib/widgets/badge.svelte",
			source: `{#if 'owner' == role}…{/if}`,
		};
		expect(roleBreaches([share, includes, reversed])).toEqual([
			`${share.path}: === "owner"`,
			`${includes.path}: .includes("admin")`,
			`${reversed.path}: 'owner' ==`,
		]);
	});

	test("lets through the roles' own files, comments, labels and the seed's assignments", () => {
		expect(
			roleBreaches([
				{ path: "src/lib/auth/members.ts", source: `roles.includes("owner")` },
				{ path: "src/lib/widgets/doc.ts", source: `// an owner: role === "owner"` },
				{
					path: "src/lib/server/db/demo.ts",
					source: `{ organizationId: "org-north", role: "owner" }`,
				},
				{
					path: "src/lib/widgets/picker.ts",
					source: `const roles = ["owner", "admin", "member"];`,
				},
				{ path: "src/lib/widgets/ok.ts", source: `if (isManager(roles)) return;` },
			]),
		).toEqual([]);
	});
});

// --- Rules 4 and 5: the portals' reads and the contact lookup ---------------------------------
//
// 4. portals never scope by tenant alone: in the files that serve an engineer or a customer's
//    contact (`src/routes/(field)/`, `src/routes/(customer)/`, a module's `portal/` and `client/`,
//    and any file that makes remote functions with `forEngineers` or `forCustomers`), `inTenant(`,
//    `idInTenant(` and `idsInTenant(` on a table that has an access rule are refused: they read
//    through `visible()` (the registry's condition for the viewer) or the audience scopes (the work
//    record's, the units'), which are made from it. This generalises `engineer-scope.spec.ts` from
//    `order` to every type, and covers the modules' portal files that `hand-written.spec.ts`'s
//    units-by-audience check doesn't. `tenantOnly` lists the few reads that legitimately are the
//    tenant's alone, each with its reason.
// 5. no second contact lookup: `.from(portalContact)` and `db.query.portalContact` outside
//    `src/lib/server/auth/` (`customerAccessIn()`, the one lookup) and the portal-access feature
//    (the office's own page of its contacts) are refused (`customerSees` was one).

/**
 * The tenant-only scopings in portal-gated files that may stay, as `path: fn(table, …)`, and why
 * each does. Not a place to add a read: a read that picks records for the viewer asks the registry.
 */
const tenantOnly: Record<string, string> = {
	"src/routes/(field)/my/portal.remote.ts: idInTenant(order, …)":
		"writes the order it found through the engineer's scope (`idInTenant(order, found.id)`)",
	"src/modules/materials/portal/field-materials.remote.ts: inTenant(orderLine, …)":
		"the lines of the order it found through the engineer's scope; the `order_line` rule is the office's only (access.ts there), so it can't be asked for them",
	"src/modules/parts-shop/suggestions/suggested-parts.remote.ts: idInTenant(shopProduct, …)":
		"the office's `addSuggestedPart` in a file that also holds the customer's `getClientSuggestedParts` (which reads the catalogue, as the `shop_product` rule has it)",
};

/** The table names of the rules, as the variables that name them in source (`customer_site` → `customerSite`). */
async function ruledTables() {
	const camel = (name: string) =>
		name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
	const rules = await as(north.owner, () => [
		...Object.values(coreRules),
		...modules.flatMap((module) =>
			generatedServerModules()
				.filter((each) => each.id === module.id)
				.flatMap(({ contributions }) => contributions)
				.filter(({ point }) => point.id === "access.rules")
				.flatMap(({ answer }) => Object.values((answer as () => object)())),
		),
	]);
	return [
		...new Set(
			rules.flatMap((rule) =>
				"row" in rule && rule.row ? [camel(getTableName(rule.row.table))] : [],
			),
		),
	];
}

/** Whether `path` serves an engineer or a customer's contact (by its place, or by the sets it uses). */
const portalFile = (path: string, text: string) =>
	path.startsWith("src/routes/(field)/") ||
	path.startsWith("src/routes/(customer)/") ||
	/^src\/modules\/[^/]+\/(portal|client)\//.test(path) ||
	/\bfor(Engineers|Customers)\./.test(text);

/** What breaks rule 4 in `files` for the tables `ruled`, as `path: fn(table, …)`. */
function portalBreaches(files: readonly SourceFile[], ruled: readonly string[]) {
	const scoping = new RegExp(
		`\\b(inTenant|idInTenant|idsInTenant)\\(\\s*(${ruled.join("|")})\\b`,
		"g",
	);
	return files.flatMap(({ path, source }) => {
		const text = code(source);
		if (!portalFile(path, text)) return [];
		return [
			...new Set([...text.matchAll(scoping)].map(([, fn, table]) => `${fn}(${table}, …)`)),
		].map((what) => `${path}: ${what}`);
	});
}

/** What breaks rule 5 in `files`, as `path: what`. */
function contactLookups(files: readonly SourceFile[]) {
	return files.flatMap(({ path, source }) => {
		if (
			path.startsWith("src/lib/server/auth/") ||
			path.startsWith("src/lib/customers/detail/portal-access")
		) {
			return [];
		}
		return /\.from\(\s*portalContact\s*\)|\bdb\.query\.portalContact\b/.test(code(source))
			? [`${path}: a second contact lookup`]
			: [];
	});
}

describe("portals never scope by tenant alone", () => {
	test("the portal files read through the registry or the audience scopes", async () => {
		const ruled = await ruledTables();
		// It knows the tables the portals read (an empty list would pass too).
		expect(ruled).toEqual(expect.arrayContaining(["order", "equipment", "customerSite"]));
		const found = portalBreaches(sources(), ruled).filter(
			(breach) => !Object.hasOwn(tenantOnly, breach),
		);
		expect(found).toEqual([]);
	});

	test("every file on the tenant-only list exists and still needs to be there", async () => {
		const ruled = await ruledTables();
		const now = new Set(portalBreaches(sources(), ruled));
		expect(Object.keys(tenantOnly).filter((breach) => !now.has(breach))).toEqual([]);
	});

	test("finds a portal file that scopes a table of a rule by the tenant alone", () => {
		const ruled = ["order", "equipment", "customerSite"];
		const field = {
			path: "src/routes/(field)/my/work.remote.ts",
			source: `db.select().from(equipment).where(inTenant(equipment));
				db.select().from(customerSite).where(idInTenant(customerSite, id));
				db.select().from(customerSite).where(idsInTenant(customerSite, ids));`,
		};
		const modulePortal = {
			path: "src/modules/widgets/client/client-widgets.remote.ts",
			source: `db.select().from(order).where(inTenant(order));`,
		};
		const gated = {
			path: "src/modules/widgets/widgets.remote.ts",
			source: `export const get = forCustomers.query(() => db.select().from(equipment).where(inTenant(equipment)));`,
		};
		expect(portalBreaches([field, modulePortal, gated], ruled)).toEqual([
			`${field.path}: inTenant(equipment, …)`,
			`${field.path}: idInTenant(customerSite, …)`,
			`${field.path}: idsInTenant(customerSite, …)`,
			`${modulePortal.path}: inTenant(order, …)`,
			`${gated.path}: inTenant(equipment, …)`,
		]);
	});

	test("lets through the office, a table without a rule, a comment, and the registry's conditions", () => {
		const ruled = ["order", "equipment"];
		const office = {
			path: "src/lib/equipment/equipment.remote.ts",
			source: `forMembers.query(() => db.select().from(equipment).where(inTenant(equipment)));`,
		};
		const other = {
			path: "src/routes/(field)/my/hours.remote.ts",
			source: `forEngineers.query(() => db.select().from(timeEntry).where(inTenant(timeEntry)));`,
		};
		const read = {
			path: "src/routes/(customer)/portal/client.remote.ts",
			source: `// not inTenant(order) here
				const where = and(await visible("order"), eq(order.number, number));`,
		};
		expect(portalBreaches([office, other, read], ruled)).toEqual([]);
	});
});

describe("no second contact lookup", () => {
	test("only the auth folder and the portal-access feature look a portal contact up", () => {
		const files = sources();
		expect(files.map((file) => file.path)).toContain("src/lib/server/auth/session.ts");
		expect(contactLookups(files)).toEqual([]);
	});

	test("finds a lookup outside them", () => {
		const hand = {
			path: "src/lib/equipment/server/qr.ts",
			source: `const [contact] = await db.select({ id: portalContact.id }).from(portalContact).where(eq(portalContact.userId, userId));`,
		};
		const query = {
			path: "src/routes/(customer)/portal/client.remote.ts",
			source: `await db.query.portalContact.findFirst({});`,
		};
		const auth = { path: "src/lib/server/auth/session.ts", source: hand.source };
		const feature = {
			path: "src/lib/customers/detail/portal-access.remote.ts",
			source: hand.source,
		};
		const write = {
			path: "src/routes/invite/[id]/invite.remote.ts",
			source: `tx.update(portalContact).set({})`,
		};
		expect(contactLookups([hand, query, auth, feature, write])).toEqual([
			`${hand.path}: a second contact lookup`,
			`${query.path}: a second contact lookup`,
		]);
	});
});
