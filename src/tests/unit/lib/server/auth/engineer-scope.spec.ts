/**
 * Keeps the engineer portal's scope in one place (`#lib/server/auth/engineer.ts`): the signed-in
 * engineer's id is read there only, so code elsewhere can't compare `order.engineerId` with it by
 * hand.
 *
 * - `currentEngineer()` hands out no `id` (nor `userId`, the way back to it): the type check
 *   (svelte-check) runs the assertion below;
 * - `requireEngineer` (which has it) is used only in `src/lib/server/auth/` and by the gates
 *   (`src/lib/server/remote-functions.ts`);
 * - `engineer.userId` is read only there and by the office's account form (`src/lib/engineers/`);
 * - an engineer-gated file (in `src/routes/(field)/` or a module's `portal/`, or one that makes
 *   remote functions with `forEngineers`) reads orders only through the scope: no
 *   `order.engineerId`, no `inTenant(order)`, no `tenantJoin(order, …)`, no
 *   `idsInTenant(order, …)`, and `idInTenant(order, …)` only to write the order it found through
 *   the scope (`idInTenant(order, found.id)`, where `found` is `findEngineerOrder()`'s or a read
 *   with `engineerOrder()`; a review keeps it so).
 *
 * The office's filters by an engineer it was given (the orders list's `?engineer=`, the planner)
 * aren't engineer-gated and hold no signed-in engineer's id: none of these match them. Run on
 * made-up files too, to show they find what they should.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import { currentEngineer } from "#lib/server/auth/index.ts";

const root = join(import.meta.dirname, "../../../../../..");

interface SourceFile {
	/** Relative to the project root, with `/`. */
	path: string;
	source: string;
}

/** The source without its comments. */
const code = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** What breaks the scope's rules in `files`, as `path: what`. */
export function scopeBreaches(files: readonly SourceFile[]) {
	return files.flatMap(({ path, source }) => {
		const text = code(source);
		const found: string[] = [];
		const inAuth = path.startsWith("src/lib/server/auth/");
		if (
			!inAuth &&
			path !== "src/lib/server/remote-functions.ts" &&
			/\brequireEngineer\b/.test(text)
		) {
			found.push("requireEngineer");
		}
		if (!inAuth && !path.startsWith("src/lib/engineers/") && /\bengineer\.userId\b/.test(text)) {
			found.push("engineer.userId");
		}
		const gated =
			path.startsWith("src/routes/(field)/") ||
			/^src\/modules\/[^/]+\/portal\//.test(path) ||
			/\bforEngineers\./.test(text);
		if (gated) {
			if (/\border\.engineerId\b/.test(text)) found.push("order.engineerId");
			if (/\binTenant\(\s*order\s*\)/.test(text)) found.push("inTenant(order)");
			if (/\btenantJoin\(\s*order\s*,/.test(text)) found.push("tenantJoin(order, …)");
			if (/\bidsInTenant\(\s*order\s*,/.test(text)) found.push("idsInTenant(order, …)");
			if (/\bidInTenant\(\s*order\s*,(?!\s*found\.id\s*\))/.test(text)) {
				found.push("idInTenant(order, …)");
			}
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

test("the app keeps to the scope", () => {
	const files = sources();
	// It reads the scope and the engineer-gated files (an empty scan would pass too).
	expect(files.map((file) => file.path)).toEqual(
		expect.arrayContaining([
			"src/lib/server/auth/engineer.ts",
			"src/routes/(field)/my/portal.remote.ts",
		]),
	);
	expect(scopeBreaches(files)).toEqual([]);
});

test("currentEngineer() hands out neither the engineer's id nor their account", () => {
	type Handed = Awaited<ReturnType<typeof currentEngineer>>;
	expectTypeOf<Handed>().not.toHaveProperty("id");
	expectTypeOf<Handed>().not.toHaveProperty("userId");
	expectTypeOf<Handed>().toHaveProperty("name");
	// Only the type check tells: at run time, that it's there to be checked.
	expect(currentEngineer).toBeTypeOf("function");
});

describe("on made-up files", () => {
	test("finds an engineer-gated file that scopes orders by hand", () => {
		const portal = {
			path: "src/modules/widgets/portal/field-widgets.remote.ts",
			source: `export const get = forEngineers.query(async () =>
				db.select().from(order).where(and(inTenant(order), eq(order.engineerId, 3))));`,
		};
		expect(scopeBreaches([portal])).toEqual([
			`${portal.path}: order.engineerId`,
			`${portal.path}: inTenant(order)`,
		]);
	});

	test("finds an order read by id or joined by hand in a portal folder", () => {
		const helper = {
			path: "src/routes/(field)/my/work.ts",
			source: `const found = await db.query.order.findFirst({ where: idInTenant(order, input.id) });
				db.select().from(orderUnit).innerJoin(...tenantJoin(order, orderUnit.orderId));
				db.select().from(order).where(idsInTenant(order, [input.id]));`,
		};
		expect(scopeBreaches([helper])).toEqual([
			`${helper.path}: tenantJoin(order, …)`,
			`${helper.path}: idsInTenant(order, …)`,
			`${helper.path}: idInTenant(order, …)`,
		]);
		const write = {
			path: "src/routes/(field)/my/portal.remote.ts",
			source: `forEngineers.form(…); await tx.update(order).set(after).where(idInTenant(order, found.id));`,
		};
		expect(scopeBreaches([write])).toEqual([]);
	});

	test("finds the ways back to the engineer's id outside the scope", () => {
		const module = {
			path: "src/modules/widgets/server/field.ts",
			source: `import { requireEngineer } from "#lib/server/auth/index.ts";
				const own = eq(engineer.userId, user.id);`,
		};
		expect(scopeBreaches([module])).toEqual([
			`${module.path}: requireEngineer`,
			`${module.path}: engineer.userId`,
		]);
	});

	test("lets the scope, the gates and the office's filters by engineer through", () => {
		expect(
			scopeBreaches([
				{
					path: "src/lib/server/auth/engineer.ts",
					source: `const { engineer } = await requireEngineer(); eq(order.engineerId, engineer.id);`,
				},
				{
					path: "src/lib/server/remote-functions.ts",
					source: `export const forEngineers = remoteSet(requireEngineer);`,
				},
				{
					path: "src/lib/orders/server/list-sql.ts",
					source: `filter: (ids) => and(inTenant(order), inList(order.engineerId, ids))`,
				},
				{
					path: "src/lib/engineers/form/account.remote.ts",
					source: `.select({ userId: engineer.userId })`,
				},
			]),
		).toEqual([]);
	});
});
