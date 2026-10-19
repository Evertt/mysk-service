/**
 * A module that makes orders by itself declares their types in its manifest (`orderTypes`), so a
 * tenant that has it can't hide them (`requiredOrderTypes()`): its automatic orders would get a
 * hidden type. Checked on its source: every order type named in a file of its own that calls
 * `createOrders()` is one it declares.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { orderTypes } from "#lib/models.ts";
import { type AppModule, modules } from "#lib/modules/manifests.ts";

const root = join(import.meta.dirname, "../../../..");

/** The order types named (as a string literal) in `source`. */
const namedTypes = (source: string) =>
	orderTypes.filter((type) => new RegExp(`["'\`]${type}["'\`]`).test(source));

/** The module's own source files (not its tests) that make orders. */
function creatingFiles(id: string) {
	const folder = join(root, "src/modules", id);
	return readdirSync(folder, { recursive: true, encoding: "utf8" })
		.filter((file) => /\.(ts|svelte)$/.test(file) && !file.startsWith("tests/"))
		.map((file) => ({ file, source: readFileSync(join(folder, file), "utf8") }))
		.filter(({ source }) => source.includes("createOrders("));
}

test("every module declares the types of the orders it makes", () => {
	const undeclared = (modules as readonly AppModule[]).flatMap((module) =>
		creatingFiles(module.id).flatMap(({ file, source }) =>
			namedTypes(source)
				.filter((type) => !(module.orderTypes ?? []).includes(type))
				.map((type) => `${module.id}/${file}: ${type}`),
		),
	);
	expect(undeclared).toEqual([]);
});

test("finds an order type named next to createOrders()", () => {
	const source = `await createOrders(tx, [{ type: unitId ? "repair" : "survey" }]);`;
	expect(namedTypes(source)).toEqual(["repair", "survey"]);
	expect(namedTypes(`const status = "open";`)).toEqual([]);
});
