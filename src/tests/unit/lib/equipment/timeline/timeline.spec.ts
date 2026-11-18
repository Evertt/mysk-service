import { describe, expect, test } from "vite-plus/test";

import {
	answerOf,
	byDay,
	isAfter,
	pageOf,
	type TimelineEntry,
} from "#lib/equipment/timeline/timeline.ts";
import { at, day } from "#unit/temporal-support.ts";

const entry = (id: string, when: string): TimelineEntry => ({
	id,
	at: at(when),
	kind: "test",
	title: id,
	tone: "neutral",
	icon: "order",
});

describe("isAfter and answerOf", () => {
	test("an entry is after the cursor when older, or as old with a smaller id", () => {
		const cursor = { at: at("2026-11-18 10:00"), id: "b" };
		expect(isAfter(entry("a", "2026-11-18 10:00"), cursor)).toBe(true);
		expect(isAfter(entry("c", "2026-11-18 10:00"), cursor)).toBe(false);
		expect(isAfter(entry("b", "2026-11-18 10:00"), cursor)).toBe(false);
		expect(isAfter(entry("z", "2026-11-18 09:59"), cursor)).toBe(true);
		expect(isAfter(entry("z", "2026-11-18 11:00"), null)).toBe(true);
	});

	test("answers the newest after the cursor, and whether it left some out", () => {
		const entries = ["09:00", "11:00", "10:00", "08:00"].map((time, i) =>
			entry(`e${i}`, `2026-11-18 ${time}`),
		);
		const answer = answerOf(entries, { at: at("2026-11-18 11:00"), id: "e1" }, 2);
		expect(answer.entries.map((each) => each.id)).toEqual(["e2", "e0"]);
		expect(answer.more).toBe(true);
	});
});

describe("pageOf", () => {
	test("merges the sources newest first, and gives the next page's cursor", () => {
		const page = pageOf(
			[
				{ entries: [entry("a", "2026-11-18 12:00"), entry("c", "2026-11-18 08:00")], more: false },
				{ entries: [entry("b", "2026-11-18 10:00")], more: false },
			],
			2,
		);
		expect(page.entries.map((each) => each.id)).toEqual(["a", "b"]);
		expect(page.next).toEqual({ at: at("2026-11-18 10:00"), id: "b" });
	});

	test("a source with older entries it didn't answer holds the page back to its last one", () => {
		const page = pageOf(
			[
				{ entries: [entry("a", "2026-11-18 12:00"), entry("b", "2026-11-18 11:00")], more: true },
				{ entries: [entry("x", "2026-11-18 09:00")], more: false },
			],
			10,
		);
		// The first source may have something between 11:00 and 09:00: x waits for the next page.
		expect(page.entries.map((each) => each.id)).toEqual(["a", "b"]);
		expect(page.next).toEqual({ at: at("2026-11-18 11:00"), id: "b" });
	});

	test("the last page has no next one", () => {
		expect(pageOf([{ entries: [entry("a", "2026-11-18 12:00")], more: false }], 5).next).toBeNull();
	});
});

describe("byDay", () => {
	test("groups the entries by their day, newest first", () => {
		const days = byDay(
			[
				entry("a", "2026-11-17 09:00"),
				entry("b", "2026-11-18 08:00"),
				entry("c", "2026-11-18 14:30"),
			],
			(moment) => moment.toZonedDateTimeISO("Europe/Amsterdam").toPlainDate(),
		);
		expect(days.map(({ day: each, entries }) => [each, entries.map((one) => one.id)])).toEqual([
			[day("2026-11-18"), ["c", "b"]],
			[day("2026-11-17"), ["a"]],
		]);
	});
});
