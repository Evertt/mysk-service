import { describe, expect, test } from "vite-plus/test";

import { byDay, showsDot, unreadLabel } from "#lib/notifications/display.ts";

describe("unreadLabel()", () => {
	test("counts up to the cap, then says there are more", () => {
		expect(unreadLabel(0)).toBeNull();
		expect(unreadLabel(1)).toBe("1");
		expect(unreadLabel(9)).toBe("9");
		expect(unreadLabel(10)).toBe("9+");
	});
});

describe("showsDot()", () => {
	test("while unread ones came in after what the page marked seen", () => {
		expect(showsDot(undefined, 0)).toBe(false);
		expect(showsDot({ count: 0, newest: null }, 0)).toBe(false);
		expect(showsDot({ count: 2, newest: 40 }, 0)).toBe(true);
		// Marked seen up to it here: the server's count lags until the next change.
		expect(showsDot({ count: 2, newest: 40 }, 40)).toBe(false);
		// One that came in after.
		expect(showsDot({ count: 3, newest: 41 }, 40)).toBe(true);
	});
});

describe("byDay()", () => {
	const at = (iso: string) => ({ at: Temporal.Instant.from(iso) });

	test("groups entries by their day in the time zone, keeping their order", () => {
		const entries = [
			at("2026-10-19T08:00:00Z"),
			at("2026-10-18T22:30:00Z"),
			at("2026-10-18T21:00:00Z"),
		];
		// 22:30 UTC is already the 19th in Amsterdam (UTC+2 in October).
		expect(
			byDay(entries, "Europe/Amsterdam").map((group) => [group.day.toString(), group.entries]),
		).toEqual([
			["2026-10-19", [entries[0], entries[1]]],
			["2026-10-18", [entries[2]]],
		]);
		expect(byDay(entries, "UTC").map((group) => group.entries.length)).toEqual([1, 2]);
	});

	test("puts each day once, newest first, also when the times are out of step with the order", () => {
		const entries = [
			at("2026-10-18T09:00:00Z"),
			at("2026-10-19T09:00:00Z"),
			at("2026-10-18T08:00:00Z"),
		];
		expect(
			byDay(entries, "UTC").map((group) => [group.day.toString(), group.entries.length]),
		).toEqual([
			["2026-10-19", 1],
			["2026-10-18", 2],
		]);
	});
});
