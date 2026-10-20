import { describe, expect, test } from "vite-plus/test";

import { renderRegistries } from "./registries.ts";
import { module } from "./test-helpers.ts";

describe("renderRegistries", () => {
	test("are valid and empty with no modules", () => {
		const files = renderRegistries([]);
		expect(files["src/lib/modules/manifests.gen.ts"]).toContain(
			"export const manifests = [] as const;",
		);
		expect(files["src/lib/modules/ids.gen.ts"]).toContain(
			"export const generatedModuleIds = [] as const;",
		);
		expect(files["src/lib/server/modules/hooks.gen.ts"]).toContain("return [] as const;");
		expect(files["src/lib/server/db/modules.gen.ts"]).toContain("export {};");
		expect(files["src/lib/server/db/module-seeds.gen.ts"]).toContain("= [];");
		expect(files["src/lib/server/db/module-schemas.gen.ts"]).toContain(
			"export const moduleSchemas = {};",
		);
	});

	test("describe the graph of the modules", () => {
		const files = renderRegistries([
			module("a"),
			module("b", { requires: ["a"], enhances: ["c"], alwaysOn: true, navAfter: "orders" }),
		]);
		expect(files["src/lib/modules/ids.gen.ts"]).toContain(
			`"b": { requires: ["a"], enhances: ["c"], alwaysOn: true, navAfter: "orders" },`,
		);
		expect(files["src/lib/modules/ids.gen.ts"]).toContain(
			`"a": { requires: [], enhances: [], alwaysOn: false, navAfter: null },`,
		);
		expect(renderRegistries([])["src/lib/modules/ids.gen.ts"]).toContain("> = {};");
	});

	test("name each module's files that exist", () => {
		const files = renderRegistries([
			module("alpha-beta", { server: { index: true, schema: true, seed: false } }),
			module("gamma"),
		]);
		expect(files["src/lib/modules/manifests.gen.ts"]).toContain(
			`import alphaBetaModule from "#modules/alpha-beta/module.ts";`,
		);
		expect(files["src/lib/modules/manifests.gen.ts"]).toContain(
			"[alphaBetaModule, gammaModule] as const",
		);
		expect(files["src/lib/modules/ids.gen.ts"]).toContain(`["alpha-beta", "gamma"] as const`);
		expect(files["src/lib/server/modules/hooks.gen.ts"]).toContain(
			`import alphaBetaServer from "#modules/alpha-beta/server/index.ts";`,
		);
		expect(files["src/lib/server/modules/hooks.gen.ts"]).not.toContain("gamma");
		expect(files["src/lib/server/db/modules.gen.ts"]).toContain(
			`export * from "#modules/alpha-beta/server/schema.ts";`,
		);
		expect(files["src/lib/server/db/module-seeds.gen.ts"]).not.toContain("alpha");
	});

	test("list each module's pages where its routes/ has them", () => {
		const files = renderRegistries([
			module("a", {
				routeFiles: [
					"(app)/+page.svelte",
					"(app)/settings/+page.svelte",
					"(app)/settings/[id]/+page.svelte",
					"(customer)/portal/+page.svelte",
				],
			}),
			module("b", { routeFiles: ["(app)/+page.svelte", "(app)/setup/+page.svelte"] }),
			module("c"),
		]);
		expect(files["src/lib/modules/pages.gen.ts"]).toContain(
			[
				`export const generatedModulePages = {`,
				`\t"a": { home: "/(app)/(modules)/a", settings: "/(app)/(modules)/a/settings", portal: "/(customer)/(modules)/a/portal" },`,
				`\t"b": { home: "/(app)/(modules)/b" },`,
				`\t"c": {},`,
				`} as const satisfies`,
			].join("\n"),
		);
		expect(renderRegistries([])["src/lib/modules/pages.gen.ts"]).toContain(
			"export const generatedModulePages = {} as const satisfies",
		);
	});

	test("collect each module's schema by namespace, in dependency order", () => {
		const files = renderRegistries([
			module("alpha-beta", { server: { index: false, schema: true, seed: false } }),
			module("gamma", { server: { index: true, schema: false, seed: true } }),
			module("delta", { server: { index: false, schema: true, seed: false } }),
		]);
		const schemas = files["src/lib/server/db/module-schemas.gen.ts"];
		expect(schemas).toContain(
			`import * as alphaBetaSchema from "#modules/alpha-beta/server/schema.ts";`,
		);
		expect(schemas).toContain(`import * as deltaSchema from "#modules/delta/server/schema.ts";`);
		expect(schemas).toContain(
			`export const moduleSchemas = {\n\t"alpha-beta": alphaBetaSchema,\n\t"delta": deltaSchema,\n};`,
		);
		expect(schemas).not.toContain("gamma");
	});
});
