import { expect, test } from "vite-plus/test";

import { label } from "#lib/i18n/index.ts";
import { overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { portalPriority } from "#routes/(customer)/portal/urgency.ts";

test("the portal's top urgency is a standstill, the office's stays urgent", () => {
	expect(portalPriority("urgent")).toBe("Standstill");
	expect(portalPriority("high")).toBe(label("orderPriority", "high"));
	overwriteGetLocale(() => "nl");
	try {
		expect(portalPriority("urgent")).toBe("Stilstand");
		expect(label("orderPriority", "urgent")).toBe("Spoed");
	} finally {
		overwriteGetLocale(() => "en");
	}
});
