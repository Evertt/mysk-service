import { expect, test } from "vite-plus/test";

import { type FeedEntry, feedLine, mergeFeed } from "#modules/condition/feed.ts";
import { at } from "#unit/temporal-support.ts";

const customer = { code: "RIE-001", name: "Riedel B.V." };
const door = { serialNumber: "SN-07", title: "Sectionaaldeur laaddok 07" };

const order = (key: string, when: string, units = [door]): FeedEntry => ({
	kind: "order",
	key,
	at: at(when),
	customer,
	type: "repair",
	number: "WO-1",
	units,
	by: "Lev",
});
const condition = (key: string, when: string, advice: string | null = null): FeedEntry => ({
	kind: "condition",
	key,
	at: at(when),
	customer,
	score: 22,
	advice,
	source: "office",
	unit: door,
	by: "Anna",
	order: null,
});
const checklist = (key: string, when: string, rejections: number): FeedEntry => ({
	kind: "checklist",
	key,
	at: at(when),
	customer,
	checklistKind: "inspection",
	rejections,
	remarks: rejections ? "Offerte volgt." : null,
	by: "Lev",
	order: "WO-2",
	unit: door,
});

test("the feed is the newest entries of all kinds, newest first", () => {
	const merged = mergeFeed(
		[
			[order("order:1", "2026-10-01 10:00"), order("order:2", "2026-10-10 10:00")],
			[condition("condition:1", "2026-10-05 10:00")],
			[checklist("checklist:1", "2026-10-10 10:00", 0)],
		],
		3,
	);
	// At the same moment, by key.
	expect(merged.map((entry) => entry.key)).toEqual(["checklist:1", "order:2", "condition:1"]);
	expect(mergeFeed([], 5)).toEqual([]);
});

test("a completed checklist reads as its work order, with what it rejected", () => {
	expect(feedLine(checklist("checklist:1", "2026-03-02 10:00", 2), "Europe/Amsterdam")).toEqual({
		soort: "Inspection",
		text: "Work order inspection 2026 completed · 2 rejected points",
		detail: "Offerte volgt.",
		units: [door],
	});
	expect(feedLine(checklist("checklist:1", "2026-03-02 10:00", 0), "Europe/Amsterdam").text).toBe(
		"Work order inspection 2026 completed · all in order",
	);
});

test("an order reads as its type completed, naming a few of its units", () => {
	const units = Array.from({ length: 5 }, (_, i) => ({
		serialNumber: `SN-${i}`,
		title: `Deur ${i}`,
	}));
	const line = feedLine(order("order:1", "2026-10-01 10:00", units), "Europe/Amsterdam");
	expect(line.soort).toBe("Repair");
	expect(line.text).toBe("Repair completed");
	expect(line.units.map((unit) => unit.title)).toEqual(["Deur 0", "Deur 1", "Deur 2"]);
	expect(line.detail).toBe("and 2 more units");
	expect(feedLine(order("order:2", "2026-10-01 10:00"), "Europe/Amsterdam").detail).toBeNull();
});

test("a condition reads with its score, and as advice when it has some", () => {
	expect(feedLine(condition("condition:1", "2026-10-01 10:00"), "Europe/Amsterdam")).toEqual({
		soort: "Condition",
		text: "Condition recorded: 22%",
		detail: null,
		units: [door],
	});
	const advised = feedLine(
		condition("condition:2", "2026-10-01 10:00", "Veerpakket vervangen."),
		"Europe/Amsterdam",
	);
	expect(advised.soort).toBe("Advice");
	expect(advised.detail).toBe("Veerpakket vervangen.");
});
