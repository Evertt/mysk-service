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
});
