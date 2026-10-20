/**
 * The server's recurring problems each have one way (`docs/agents/tenancy.md`, "One way"): these
 * specs refuse the hand-written forms that the helpers replace, as `parameters.spec.ts` does for
 * drizzle's `inArray()`. Each failure names the file and the helper to use instead.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

const root = join(import.meta.dirname, "../../../../..");

/** The app's own TypeScript, without the tests and the seed (Node only, written its own way). */
const appFiles = globSync(["src/**/*.ts"], {
	cwd: root,
	exclude: ["src/tests/**", "src/modules/*/tests/**", "src/lib/server/db/seed/**", "**/*.gen.ts"],
});

/** A file's code without its comments (keeping their lines, so lines are counted right). */
const code = (file: string) =>
	readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, (comment) =>
		comment.replace(/[^\n]/g, ""),
	);

/** `file: line` of every match of `pattern` in the app's files (but `except`). */
function offenders(pattern: RegExp, except: readonly string[] = []) {
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

/** The tables of the app's schemas, by their name in the code. */
const tables = new Set(
	globSync(["src/lib/server/db/schema/*.ts", "src/modules/*/server/schema.ts"], {
		cwd: root,
	}).flatMap((file) =>
		[...code(file).matchAll(/export const (\w+) = (?:sqliteTable|tenantTable)\(/g)].map(
			([, name]) => name,
		),
	),
);

describe("tenant scoping", () => {
	it("looks a record up by id with idInTenant(), not and(eq(table.id, id), inTenant(table))", () => {
		const pattern =
			/and\(\s*eq\((\w+)\.id,[^()]*(?:\([^()]*\))?[^()]*\),\s*inTenant\(\1\),?\s*\)|and\(\s*inTenant\((\w+)\),\s*eq\(\2\.id,[^()]*(?:\([^()]*\))?[^()]*\),?\s*\)/;
		// idInTenant() itself; a join's condition is tenantJoin().
		expect(offenders(pattern, ["src/lib/server/auth/session.ts"])).toEqual([]);
	});

	it("joins two tables of the same tenant with sameTenant(), not their organizationIds", () => {
		const found = offenders(/eq\(\s*(\w+)\.organizationId,\s*(\w+)\.organizationId\s*\)/).filter(
			(at) => {
				const [file, line] = at.split(":");
				const text = code(file).split("\n")[Number(line) - 1];
				return [...text.matchAll(/eq\(\s*(\w+)\.organizationId,\s*(\w+)\.organizationId/g)].some(
					([, a, b]) => tables.has(a) && tables.has(b),
				);
			},
		);
		expect(found, "use sameTenant() from #lib/server/auth").toEqual([]);
	});
});

describe("records", () => {
	it("looks a unit, customer or order up by its key with unitBySerial(), customerByCode() or orderByNumber()", () => {
		const key = String.raw`(?:equipment\.serialNumber|customer\.code|order\.number)`;
		const table = String.raw`(?:equipment|customer|order)`;
		const pattern = new RegExp(
			String.raw`and\(\s*eq\(${key},[^()]*\),\s*inTenant\(${table}\)\s*\)|and\(\s*inTenant\(${table}\),\s*eq\(${key},[^()]*\)\s*\)`,
		);
		expect(offenders(pattern)).toEqual([]);
	});

	it("leaves the 404 of a unit, customer or order to core's message", () => {
		const own =
			/^(?:Order \{number\}|Equipment \{serial\}|Unit \{serial\}|Customer \{code\}) not found\.?$/;
		// A shop order is the parts shop's own record, numbered like an order.
		const exempt = new Set(["shop_order_not_found"]);
		const copies = globSync(["src/modules/*/messages/en/*.json"], { cwd: root }).flatMap((file) =>
			Object.entries(JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, string>)
				.filter(([key, text]) => !exempt.has(key) && own.test(text))
				.map(([key]) => `${file}: ${key}`),
		);
		expect(copies, "use the domain's lookup, which refuses with core's message").toEqual([]);
	});

	it("answers a row or a 404 with orNotFound() (a batch query's with byKey())", () => {
		// The demo's sign-in, behind a flag rather than a row.
		expect(
			offenders(/if \(!\w+\) error\(404,/, [
				"src/routes/demo.remote.ts",
				"src/lib/server/records.ts",
			]),
		).toEqual([]);
	});

	it("places a new record with nextPosition(), not max(position) + 1", () => {
		expect(offenders(/max\(\$\{\s*\w+\.position\s*\}\)/, ["src/lib/server/records.ts"])).toEqual(
			[],
		);
	});

	it("moves a record with moveSchema and reorder(), not its own up-or-down picklist", () => {
		expect(offenders(/picklist\(\[\s*"up",\s*"down"\s*\]\)/, ["src/lib/schema.ts"])).toEqual([]);
	});

	it("deletes and logs with deleteAndLog() or defineRemoval()", () => {
		// A deletion logged only when shared (views), several lines at once (an invoice's order),
		// with what it changes besides (an order's engineer), or an announcement without a log.
		const special = [
			"src/lib/components/data-table/views.remote.ts",
			"src/lib/orders/server/order-changes.ts",
			"src/modules/invoices/detail/draft.remote.ts",
			"src/modules/energy/server/live-simulation.ts",
		];
		expect(offenders(/action:\s*"deleted"/, ["src/lib/server/records.ts", ...special])).toEqual([]);
	});
});

describe("refusals", () => {
	it("refuses with a thrown Refused; invalid() only refuses a remote form's own field", () => {
		const found: string[] = [];
		for (const file of appFiles) {
			const text = code(file);
			for (const match of text.matchAll(/(?<![\w.])invalid\(/g)) {
				// The call's arguments, up to its closing parenthesis.
				let depth = 0;
				let end = match.index + match[0].length - 1;
				do {
					if (text[end] === "(") depth++;
					if (text[end] === ")") depth--;
					end++;
				} while (depth > 0 && end < text.length);
				const call = text.slice(match.index, end);
				if (file.endsWith(".remote.ts") && /\bissue\b/.test(call)) continue;
				// Where a Refused becomes the form's issues.
				if (file === "src/lib/server/refused.ts") continue;
				found.push(`${file}:${text.slice(0, match.index).split("\n").length}`);
			}
		}
		expect(found, "throw new Refused(…) from #lib/server/refused.ts").toEqual([]);
	});

	it("keeps transactions out of remote files: services in server/ make the change", () => {
		// The remote files that still hold one; move it into the section's server/ when you change
		// it, and take it off the list.
		const remaining = [
			"src/lib/components/data-table/views.remote.ts",
			"src/lib/customers/customers.remote.ts",
			"src/lib/customers/detail/portal-access.remote.ts",
			"src/lib/engineers/engineers.remote.ts",
			"src/lib/engineers/form/account.remote.ts",
			"src/lib/equipment/equipment.remote.ts",
			"src/lib/equipment/list/equipment-list.remote.ts",
			"src/lib/orders/detail/acceptance.remote.ts",
			"src/lib/orders/list/order-bulk.remote.ts",
			"src/lib/orders/list/order-status.remote.ts",
			"src/lib/orders/order.remote.ts",
			"src/modules/condition/settings.remote.ts",
			"src/modules/energy/thresholds.remote.ts",
			"src/modules/invoices/credit-notes.remote.ts",
			"src/modules/invoices/detail/credit-note.remote.ts",
			"src/modules/invoices/detail/draft.remote.ts",
			"src/modules/invoices/invoice-status.remote.ts",
			"src/modules/invoices/settings.remote.ts",
			"src/modules/maintenance/settings.remote.ts",
			"src/modules/materials/detail/stock.remote.ts",
			"src/modules/materials/material.remote.ts",
			"src/modules/materials/portal/field-materials.remote.ts",
			"src/modules/partner-programme/partners.remote.ts",
			"src/modules/partner-programme/years.remote.ts",
			"src/modules/parts-shop/suggestions/suggested-parts.remote.ts",
			"src/modules/schedule/schedule.remote.ts",
			"src/routes/(app)/settings/settings.remote.ts",
			"src/routes/(customer)/portal/client.remote.ts",
			"src/routes/(field)/my/portal.remote.ts",
		];
		const holding = appFiles.filter(
			(file) => file.endsWith(".remote.ts") && /\.transaction\(/.test(code(file)),
		);
		expect(holding.filter((file) => !remaining.includes(file))).toEqual([]);
		// Moved out already: take it off the list.
		expect(remaining.filter((file) => !holding.includes(file))).toEqual([]);
	});
});
