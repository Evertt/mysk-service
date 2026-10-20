import { expect, test } from "vite-plus/test";

import { orderStatuses } from "#lib/models.ts";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import {
	clientStatus,
	clientStatusDisplay,
	clientStatuses,
} from "#routes/(customer)/portal/client-status.ts";

test("an order's status reads as the customer follows it", () => {
	expect(orderStatuses.map((status) => clientStatus(status, null))).toEqual([
		"awaiting",
		"accepted",
		"scheduled",
		"in_progress",
		"done",
		"done",
		"cancelled",
	]);
});

test("a cancelled order with a rejection reason was rejected", () => {
	expect(clientStatus("cancelled", "Niet ons onderhoud")).toBe("rejected");
	// Only a cancelled one: the reason of an order that went on isn't its status.
	expect(clientStatus("quote", "Niet ons onderhoud")).toBe("accepted");
});

test("every status reads in SHLTR's words in Dutch", () => {
	const englishByDefault = getLocale;
	overwriteGetLocale(() => "nl");
	try {
		expect(clientStatuses.map((status) => clientStatusDisplay[status].label)).toEqual([
			"Opdracht nog niet geaccepteerd",
			"Opdracht geaccepteerd",
			"Ingepland",
			"In behandeling",
			"Afgerond",
			"Afgewezen",
			"Geannuleerd",
		]);
	} finally {
		overwriteGetLocale(englishByDefault);
	}
});
