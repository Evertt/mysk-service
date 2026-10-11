import { expect, test } from "vite-plus/test";

import { contractMonths, monthlyFee, monthReference } from "#modules/contracts/server/billing.ts";

const year = { startsOn: new Date(2026, 0, 1), endsOn: new Date(2026, 11, 31) };
const days = (months: { startsOn: Date; endsOn: Date }[]) =>
	months.map((m) => [m.startsOn.toDateString(), m.endsOn.toDateString()]);

test("a contract from the first runs in calendar months", () => {
	const months = contractMonths(year, new Date(2026, 0, 1), new Date(2026, 11, 31));
	expect(months).toHaveLength(12);
	expect(months[1]).toEqual({ startsOn: new Date(2026, 1, 1), endsOn: new Date(2026, 1, 28) });
	expect(months[11]).toEqual({ startsOn: new Date(2026, 11, 1), endsOn: new Date(2026, 11, 31) });
});

test("only the months that start in the period, both days included", () => {
	expect(days(contractMonths(year, new Date(2026, 2, 1), new Date(2026, 4, 1)))).toEqual(
		days([
			{ startsOn: new Date(2026, 2, 1), endsOn: new Date(2026, 2, 31) },
			{ startsOn: new Date(2026, 3, 1), endsOn: new Date(2026, 3, 30) },
			{ startsOn: new Date(2026, 4, 1), endsOn: new Date(2026, 4, 31) },
		]),
	);
	// A month is billed in advance: from its first day, in full.
	expect(contractMonths(year, new Date(2026, 9, 1), new Date(2026, 9, 7))).toEqual([
		{ startsOn: new Date(2026, 9, 1), endsOn: new Date(2026, 9, 31) },
	]);
	expect(contractMonths(year, new Date(2026, 9, 2), new Date(2026, 9, 31))).toEqual([]);
});

test("nothing before the contract starts or after it ends", () => {
	expect(contractMonths(year, new Date(2025, 0, 1), new Date(2025, 11, 31))).toEqual([]);
	expect(contractMonths(year, new Date(2027, 0, 1), new Date(2027, 11, 31))).toEqual([]);
});

test("mid-month starts run to the day before, and the last month ends with the contract", () => {
	const contract = { startsOn: new Date(2026, 0, 31), endsOn: new Date(2026, 3, 15) };
	expect(days(contractMonths(contract, new Date(2026, 0, 1), new Date(2026, 11, 31)))).toEqual(
		days([
			{ startsOn: new Date(2026, 0, 31), endsOn: new Date(2026, 1, 27) },
			{ startsOn: new Date(2026, 1, 28), endsOn: new Date(2026, 2, 30) },
			{ startsOn: new Date(2026, 2, 31), endsOn: new Date(2026, 3, 15) },
		]),
	);
});

test("each month's fee is an item with a reference of its own", () => {
	const [october] = contractMonths(year, new Date(2026, 9, 1), new Date(2026, 9, 1));
	expect(monthReference(12, october)).toBe("contracts:12:2026-10-01");
	expect(
		monthlyFee({ id: 12, monthlyFee: 45_000 }, october, {
			description: "Service contract CTR-2026-0012 (Premium)",
			detail: "Monthly fee, 1 Oct 2026 – 31 Oct 2026",
		}),
	).toEqual({
		reference: "contracts:12:2026-10-01",
		description: "Service contract CTR-2026-0012 (Premium)",
		detail: "Monthly fee, 1 Oct 2026 – 31 Oct 2026",
		quantity: 1,
		unitPrice: 45_000,
		date: new Date(2026, 9, 1),
	});
});
