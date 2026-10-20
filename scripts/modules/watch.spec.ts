import { describe, expect, test } from "vite-plus/test";

import { rerunsOn } from "./watch.ts";

describe("rerunsOn", () => {
	test("reruns when a module's module.ts changes: its requires and enhances are read from it", () => {
		expect(rerunsOn("change", "src/modules/sample/module.ts")).toBe(true);
	});

	test("reruns when a route script changes, not other files", () => {
		expect(rerunsOn("change", "src/modules/sample/routes/(app)/+page.ts")).toBe(true);
		expect(rerunsOn("change", "src/modules/sample/server/index.ts")).toBe(false);
		expect(rerunsOn("change", "src/modules/sample/messages/en/sample.json")).toBe(false);
	});

	test("reruns when inputs come or go", () => {
		expect(rerunsOn("add", "src/modules/sample/module.ts")).toBe(true);
		expect(rerunsOn("unlink", "src/modules/sample/server/seed.ts")).toBe(true);
	});

	test("reruns when contribution files come or go, and when extension points change", () => {
		expect(rerunsOn("add", "src/modules/sample/slots/orders.detail.side/card.svelte")).toBe(true);
		expect(rerunsOn("unlink", "src/modules/sample/bulk-actions/orders.list.ts")).toBe(true);
		expect(rerunsOn("change", "src/modules/sample/slots/orders.detail.side/card.svelte")).toBe(
			false,
		);
		expect(rerunsOn("change", "src/lib/orders/extensions.ts")).toBe(true);
		expect(rerunsOn("add", "src/modules/sample/api/extensions.ts")).toBe(true);
		expect(rerunsOn("change", "src/modules/sample/api/extensions.ts")).toBe(true);
		expect(rerunsOn("change", "src/modules/sample/api/other.ts")).toBe(false);
	});

	test("reruns when a file that tags enum arrays with @labels changes", () => {
		const tagged = () => "/** @labels orderStatus */";
		expect(rerunsOn("change", "src/lib/models.ts", tagged)).toBe(true);
		expect(rerunsOn("change", "src/modules/sample/model.ts", tagged)).toBe(true);
		expect(rerunsOn("change", "src/modules/sample/model.ts", () => "")).toBe(false);
		expect(rerunsOn("change", "src/lib/i18n/labels.gen.ts", tagged)).toBe(false);
		expect(rerunsOn("change", "src/modules/sample/tests/unit/model.spec.ts", tagged)).toBe(false);
	});

	test("ignores files that aren't inputs", () => {
		expect(rerunsOn("change", "src/lib/modules/ids.gen.ts")).toBe(false);
		expect(rerunsOn("add", "src/modules/sample/other.ts")).toBe(false);
	});
});
