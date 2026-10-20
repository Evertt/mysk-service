/**
 * A tenant's table is declared one way (`docs/agents/database.md`, "Tenant tables"): with
 * `tenantTable()`, its references with `tenantRef()` or `optionalTenantRef()`, their relations with
 * `tenantOne()`, and an optional reference's tenant set with `withTenantRefs()`, all in
 * `#lib/server/db/columns.ts`. These specs refuse the hand-written forms, naming the file and line.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

const root = join(import.meta.dirname, "../../../../../..");

/** The app's TypeScript (the seed's too), but the factories themselves and the tests. */
const files = globSync(["src/**/*.ts"], {
	cwd: root,
	exclude: [
		"src/tests/**",
		"src/modules/*/tests/**",
		"src/lib/server/db/columns.ts",
		// better-auth's own tables (its organization plugin's members and invitations).
		"src/lib/server/db/auth.schema.ts",
	],
});

/** A file's code without its comments (keeping their lines, so lines are counted right). */
const code = (file: string) =>
	readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, (comment) =>
		comment.replace(/[^\n]/g, ""),
	);

/** `file:line` of every match of `pattern` in the app's files, but those `except`. */
function offenders(pattern: RegExp, except: readonly string[] = []) {
	const found: string[] = [];
	for (const file of files) {
		if (except.includes(file)) continue;
		const text = code(file);
		for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
			found.push(`${file}:${text.slice(0, match.index).split("\n").length}`);
		}
	}
	return found;
}

describe("tenant tables", () => {
	it("declares a tenant's table with tenantTable(), not sqliteTable() and organizationId", () => {
		// A `sqliteTable()` call up to the end of its columns.
		const table = /sqliteTable\(\s*"\w+",\s*\{(?:[^{}]|\{[^{}]*\})*"organization_id"/;
		// The bug reports are the platform's: their organization only says who reported one.
		expect(offenders(table, ["src/lib/server/db/schema/infra.ts"])).toEqual([]);
		expect(offenders(/organizationId\(\)/)).toEqual([]);
	});

	it("gives a referenced table its (organization_id, id) index with referenced: true", () => {
		expect(offenders(/uniqueIndex\(\s*"\w+_organization_id"\s*\)/)).toEqual([]);
	});

	it("refers to a row of the tenant's with tenantRef() or optionalTenantRef()", () => {
		// A foreign key whose columns include a tenant column: the table's or an optional one's.
		const key = /foreignKey\(\{\s*columns:\s*\[[^\]]*\.\w*[oO]rganizationId\b/;
		expect(offenders(key)).toEqual([]);
		expect(offenders(/check\(\s*"\w+_tenant"/)).toEqual([]);
	});

	it("relates two of the tenant's tables with tenantOne()", () => {
		expect(offenders(/fields:\s*\[\s*\w+\.\w*[oO]rganizationId\b/)).toEqual([]);
	});

	it("sets an optional reference's tenant with withTenantRefs()", () => {
		// `activeOrganizationId` is better-auth's session's.
		expect(offenders(/\b(?!active)[a-z]\w*OrganizationId\s*:/)).toEqual([]);
	});
});
