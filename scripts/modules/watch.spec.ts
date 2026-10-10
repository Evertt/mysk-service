import { describe, expect, test } from "vite-plus/test";

import { rerunsOn } from "./watch.ts";

describe("rerunsOn", () => {
	test("reruns when a module's module.ts changes: its requires and enhances are read from it", () => {
		expect(rerunsOn("change", "src/modules/sample/module.ts")).toBe(true);
	});

	test("reruns when a route script changes, not other files", () => {
		expect(rerunsOn("change", "src/modules/sample/routes/(app)/sample/+page.ts")).toBe(true);
		expect(rerunsOn("change", "src/modules/sample/server/index.ts")).toBe(false);
		expect(rerunsOn("change", "src/modules/sample/messages/en/sample.json")).toBe(false);
	});

	test("reruns when inputs come or go", () => {
		expect(rerunsOn("add", "src/modules/sample/module.ts")).toBe(true);
		expect(rerunsOn("unlink", "src/modules/sample/server/seed.ts")).toBe(true);
	});

	test("ignores files that aren't inputs", () => {
		expect(rerunsOn("change", "src/lib/modules/ids.gen.ts")).toBe(false);
		expect(rerunsOn("add", "src/modules/sample/other.ts")).toBe(false);
	});
});
