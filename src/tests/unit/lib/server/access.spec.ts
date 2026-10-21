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
	"src/lib/server/notifications/notifications.ts": "the bell's tray: rules pick its entries",
	"src/lib/server/notifications/rules.ts": "the rules that pick the bells' entries",
	// Step 5 makes its `exists` from `visible("order")`.
	"src/lib/server/auth/engineer.ts": "`engineerActivity()` is scoped to the engineer's orders",
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
