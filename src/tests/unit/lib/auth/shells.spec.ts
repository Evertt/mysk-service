/**
 * Where a role lands and which pages are its shell's: `shellOf(roles)` (`#lib/auth/shells.ts`),
 * and the login page's link back with `loginUrl(target)`. Besides their unit tests, checks over
 * the app's source refuse the hand-written forms they replace (a redirect to a shell's home by a
 * role check of its own, a `/login?redirectTo=` built by hand), naming the file and line.
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { memberRoles } from "#lib/auth/roles.ts";
import { loginUrl, type ShellName, shellOf, shells } from "#lib/auth/shells.ts";

const root = join(import.meta.dirname, "../../../../..");

/** Every combination of the member roles (32), the empty one too. */
const roleSets = memberRoles.reduce<string[][]>(
	(sets, role) => [...sets, ...sets.map((set) => [...set, role])],
	[[]],
);

describe("shellOf", () => {
	test("puts every combination of roles in the shell its strongest role works in", () => {
		const office = ["owner", "admin", "member"];
		for (const roles of roleSets) {
			const expected: ShellName = roles.some((role) => office.includes(role))
				? "office"
				: roles.includes("engineer")
					? "engineer"
					: roles.includes("customer")
						? "customer"
						: "office";
			expect(shellOf(roles).name, roles.join(",")).toBe(expected);
		}
	});

	test("an office role beside another works in the office, an engineer and contact as an engineer", () => {
		expect(shellOf(["owner", "engineer"])).toBe(shells.office);
		expect(shellOf(["member", "customer"])).toBe(shells.office);
		expect(shellOf(["engineer", "customer"])).toBe(shells.engineer);
		expect(shellOf(["engineer"])).toBe(shells.engineer);
		expect(shellOf(["customer"])).toBe(shells.customer);
		expect(shellOf([])).toBe(shells.office);
	});

	test("each shell starts at its home", () => {
		expect(Object.values(shells).map(({ name, home }) => [name, home])).toEqual([
			["office", "/"],
			["engineer", "/my"],
			["customer", "/portal"],
		]);
	});
});

/** The route id of every page and endpoint in `src/routes` (a `+page.svelte` or `+server.ts`). */
const routeIds = globSync("src/routes/**/{+page.svelte,+server.ts}", { cwd: root }).map((file) => {
	const folder = relative("src/routes", dirname(file)).split("\\").join("/");
	return folder ? `/${folder}` : "/";
});

describe("owns", () => {
	const owners = (routeId: string | null) =>
		Object.values(shells)
			.filter((shell) => shell.owns(routeId))
			.map(({ name }) => name);

	test("knows the app's routes", () => {
		expect(routeIds).toContain("/(field)/my");
		expect(routeIds).toContain("/(customer)/portal");
		expect(routeIds).toContain("/(customer)/(modules)/parts-shop/portal");
		expect(routeIds).toContain("/q/[token]");
	});

	test("the engineer portal is the engineer's, and the office may open it too", () => {
		const field = routeIds.filter((id) => id.startsWith("/(field)/"));
		expect(field.length).toBeGreaterThan(0);
		for (const id of field) expect(owners(id), id).toEqual(["office", "engineer"]);
	});

	test("the customer portal, a module's pages there too, is only the customer's", () => {
		const portal = routeIds.filter((id) => id.startsWith("/(customer)/"));
		expect(portal.length).toBeGreaterThan(0);
		for (const id of portal) expect(owners(id), id).toEqual(["customer"]);
	});

	test("a QR code's link is every shell's: it leads each into theirs", () => {
		expect(owners("/q/[token]")).toEqual(["office", "engineer", "customer"]);
	});

	test("every other page, and a path no route has, is only the office's", () => {
		const others = routeIds.filter(
			(id) => !/^\/\((?:field|customer)\)\//.test(id) && id !== "/q/[token]",
		);
		for (const id of [...others, null]) expect(owners(id), String(id)).toEqual(["office"]);
	});
});

describe("loginUrl", () => {
	test("is the plain login page for nothing or the start page", () => {
		expect(loginUrl()).toBe("/login");
		expect(loginUrl("")).toBe("/login");
		expect(loginUrl("/")).toBe("/login");
	});

	test("leads back to any other page, with its search, encoded", () => {
		expect(loginUrl("/orders?status=quote")).toBe("/login?redirectTo=%2Forders%3Fstatus%3Dquote");
		expect(loginUrl("/q/abc123")).toBe("/login?redirectTo=%2Fq%2Fabc123");
		expect(new URL(loginUrl("/a b&c=d#e"), "http://x").searchParams.get("redirectTo")).toBe(
			"/a b&c=d#e",
		);
	});
});

// --- The hand-written forms --------------------------------------------------------------------

const shellsFile = "src/lib/auth/shells.ts";

/** The app's own code, without the tests and the seed. */
const appFiles = globSync(["src/**/*.{ts,svelte}"], {
	cwd: root,
	exclude: [
		"src/tests/**",
		"src/modules/*/tests/**",
		"src/lib/server/db/seed/**",
		"src/lib/paraglide/**",
		"**/*.gen.ts",
	],
});

/** A file's code without its comments (keeping their lines, so lines are counted right). */
const code = (file: string) =>
	readFileSync(join(root, file), "utf8").replace(
		/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|(?<![:"'`])\/\/.*$/gm,
		(comment) => comment.replace(/[^\n]/g, ""),
	);

/** `file:line` of every match of `pattern` in the app's files, but those of `except`. */
function offenders(pattern: RegExp, except: readonly string[]) {
	const found: string[] = [];
	for (const file of appFiles) {
		if (except.includes(file)) continue;
		const text = code(file);
		for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
			found.push(`${file}:${text.slice(0, match.index).split("\n").length}`);
		}
	}
	return found;
}

describe("one way to a shell's home and the login page", () => {
	test("names a portal's home through its shell (shellOf(roles).home), never as a literal", () => {
		expect(offenders(/["'`]\/(?:my|portal)["'`]/, [shellsFile]), "use shellOf()").toEqual([]);
	});

	test("links to the login page and back with loginUrl(), not a hand-built redirectTo", () => {
		const pattern =
			/\/login\?redirectTo|URLSearchParams\(\s*\{[^}]*\bredirectTo\b|searchParams\.(?:set|append)\(\s*["'`]redirectTo/;
		expect(offenders(pattern, [shellsFile]), "use loginUrl()").toEqual([]);
	});

	/**
	 * The files that may ask `isFieldEngineer()` or `isCustomerContact()` themselves, as it isn't
	 * about where someone lands or which pages are theirs, and why.
	 */
	const roleChecks: Record<string, string> = {
		"src/lib/auth/roles.ts": "where they're defined",
		[shellsFile]: "shellOf() itself",
		"src/lib/server/auth/session.ts":
			"the remote functions' gates: requireMember() refuses engineers and contacts, requireCustomer() all but contacts",
		"src/lib/server/bug-reports/upload.ts": "a customer's contact may not send bug reports",
		"src/routes/invite/[id]/invite.remote.ts":
			"accepting a contact's invitation links their account to the contact",
		"src/modules/materials/server/index.ts":
			"a change by an engineer refreshes the engineer portal's queries",
		"src/modules/checklists/server/index.ts":
			"a change by an engineer refreshes the engineer portal's queries",
	};
	const roleCheck =
		/(?<!\b(?:import|export)\s+(?:type\s+)?\{[^}]*)\b(?:isFieldEngineer|isCustomerContact)\b/;

	test("decides by role where someone lands only through shellOf()", () => {
		expect(offenders(roleCheck, Object.keys(roleChecks)), "use shellOf()").toEqual([]);
	});

	test("each file allowed a role check of its own still has one", () => {
		const unused = Object.keys(roleChecks).filter(
			(file) => !new RegExp(roleCheck.source).test(code(file)),
		);
		expect(unused, "drop it from roleChecks").toEqual([]);
	});
});
