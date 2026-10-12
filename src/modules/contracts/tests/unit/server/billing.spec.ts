import { expect, test } from "vite-plus/test";

import { contractMonths, monthlyFee, monthReference } from "#modules/contracts/server/billing.ts";
import { day } from "#unit/temporal-support.ts";

const year = { startsOn: day("2026-01-01"), endsOn: day("2026-12-31") };
const days = (months: { startsOn: Temporal.PlainDate; endsOn: Temporal.PlainDate }[]) =>
	months.map((m) => [m.startsOn.toString(), m.endsOn.toString()]);

test("a contract from the first runs in calendar months", () => {
	const months = contractMonths(year, day("2026-01-01"), day("2026-12-31"));
	expect(months).toHaveLength(12);
	expect(months[1]).toEqual({ startsOn: day("2026-02-01"), endsOn: day("2026-02-28") });
	expect(months[11]).toEqual({ startsOn: day("2026-12-01"), endsOn: day("2026-12-31") });
});

test("only the months that start in the period, both days included", () => {
	expect(days(contractMonths(year, day("2026-03-01"), day("2026-05-01")))).toEqual(
		days([
			{ startsOn: day("2026-03-01"), endsOn: day("2026-03-31") },
			{ startsOn: day("2026-04-01"), endsOn: day("2026-04-30") },
			{ startsOn: day("2026-05-01"), endsOn: day("2026-05-31") },
		]),
	);
	// A month is billed in advance: from its first day, in full.
	expect(contractMonths(year, day("2026-10-01"), day("2026-10-07"))).toEqual([
		{ startsOn: day("2026-10-01"), endsOn: day("2026-10-31") },
	]);
	expect(contractMonths(year, day("2026-10-02"), day("2026-10-31"))).toEqual([]);
});

test("nothing before the contract starts or after it ends", () => {
	expect(contractMonths(year, day("2025-01-01"), day("2025-12-31"))).toEqual([]);
	expect(contractMonths(year, day("2027-01-01"), day("2027-12-31"))).toEqual([]);
});

test("mid-month starts run to the day before, and the last month ends with the contract", () => {
	const contract = { startsOn: day("2026-01-31"), endsOn: day("2026-04-15") };
	expect(days(contractMonths(contract, day("2026-01-01"), day("2026-12-31")))).toEqual(
		days([
			{ startsOn: day("2026-01-31"), endsOn: day("2026-02-27") },
			{ startsOn: day("2026-02-28"), endsOn: day("2026-03-30") },
			{ startsOn: day("2026-03-31"), endsOn: day("2026-04-15") },
		]),
	);
});

test("each month's fee is an item with a reference of its own", () => {
	const [october] = contractMonths(year, day("2026-10-01"), day("2026-10-01"));
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
		date: day("2026-10-01"),
	});
});
