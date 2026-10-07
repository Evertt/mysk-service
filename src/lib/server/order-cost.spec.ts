import { expect, test } from "vite-plus/test";

import { orderCost } from "./order-cost.ts";
import { STANDARD_HOURLY_RATE } from "./pricing.ts";

test("adds the material lines to the labour at the engineer's rate", () => {
	expect(
		orderCost({
			laborHours: 2,
			hourlyRate: 6000,
			lines: [
				{ quantity: 3, unitPrice: 1250 },
				{ quantity: 1, unitPrice: 999 },
			],
		}),
	).toEqual({ materials: 4749, labor: 12_000, total: 16_749 });
});

test("rounds each line to the cent, like the order totals", () => {
	expect(
		orderCost({ laborHours: 0, hourlyRate: 0, lines: [{ quantity: 2.5, unitPrice: 333 }] }),
	).toEqual({ materials: 833, labor: 0, total: 833 });
});

test("estimates labour at the standard rate while no engineer is assigned", () => {
	expect(orderCost({ laborHours: 1.5, hourlyRate: null, lines: [] })).toEqual({
		materials: 0,
		labor: Math.round(1.5 * STANDARD_HOURLY_RATE),
		total: Math.round(1.5 * STANDARD_HOURLY_RATE),
	});
});
