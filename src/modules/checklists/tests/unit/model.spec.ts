import { describe, expect, test } from "vite-plus/test";

import {
	canComplete,
	changedPlaces,
	checklistKind,
	checklistScore,
	componentPoints,
	completionProblems,
	getsChecklists,
	groupPoints,
	inspectionStatus,
	moveGroup,
	movePoint,
	orderPoints,
	placePoint,
	type PointPlace,
	progress,
	rejectedFirst,
	rejections,
	shownChecklist,
	validUntil,
	yearBounds,
	type YearChecklist,
} from "#modules/checklists/model.ts";
import { day } from "#unit/temporal-support.ts";

/** Points from `[group, id]` pairs, in that order, numbered from 0. */
const points = (...pairs: [string, number][]): PointPlace[] =>
	pairs.map(([group, id], position) => ({ id, group, position }));

/** An order as `group:id` texts, to read the expectations at a glance. */
const read = (order: { id: number; group: string }[]) => order.map((p) => `${p.group}:${p.id}`);

const template = points(["M", 1], ["M", 2], ["E", 3], ["V", 4], ["V", 5]);

describe("orderPoints", () => {
	test("keeps each group's points together, groups in the order of their first point", () => {
		const scattered = [
			{ id: 1, group: "M", position: 0 },
			{ id: 2, group: "E", position: 1 },
			{ id: 3, group: "M", position: 2 },
			{ id: 4, group: "E", position: 3 },
		];
		expect(read(orderPoints(scattered))).toEqual(["M:1", "M:3", "E:2", "E:4"]);
	});

	test("orders by position, then id, whatever order they come in", () => {
		const shuffled = [
			{ id: 9, group: "", position: 5 },
			{ id: 3, group: "", position: 1 },
			{ id: 2, group: "", position: 1 },
		];
		expect(orderPoints(shuffled).map((p) => p.id)).toEqual([2, 3, 9]);
	});

	test("groupPoints puts them under their groups' headings", () => {
		expect(groupPoints(template).map(({ group, points }) => [group, points.length])).toEqual([
			["M", 2],
			["E", 1],
			["V", 2],
		]);
	});
});

describe("movePoint", () => {
	test("swaps a point with its neighbour in its group", () => {
		expect(read(movePoint(template, 2, "up"))).toEqual(["M:2", "M:1", "E:3", "V:4", "V:5"]);
		expect(read(movePoint(template, 4, "down"))).toEqual(["M:1", "M:2", "E:3", "V:5", "V:4"]);
	});

	test("at its group's edge, moves it into the next group, where it stands", () => {
		// The first of V, up: the last of E.
		expect(read(movePoint(template, 4, "up"))).toEqual(["M:1", "M:2", "E:3", "E:4", "V:5"]);
		// The last of M, down: the first of E.
		expect(read(movePoint(template, 2, "down"))).toEqual(["M:1", "E:2", "E:3", "V:4", "V:5"]);
		// The only one of E, up: its group is gone.
		expect(read(movePoint(template, 3, "up"))).toEqual(["M:1", "M:2", "M:3", "V:4", "V:5"]);
	});

	test("leaves the first point up, the last down and an unknown one as they are", () => {
		expect(read(movePoint(template, 1, "up"))).toEqual(read(template));
		expect(read(movePoint(template, 5, "down"))).toEqual(read(template));
		expect(read(movePoint(template, 99, "up"))).toEqual(read(template));
	});
});

describe("moveGroup", () => {
	test("moves a group past the one before or after it, with its points", () => {
		expect(read(moveGroup(template, "V", "up"))).toEqual(["M:1", "M:2", "V:4", "V:5", "E:3"]);
		expect(read(moveGroup(template, "M", "down"))).toEqual(["E:3", "M:1", "M:2", "V:4", "V:5"]);
	});

	test("leaves the first group up, the last down and an unknown one as they are", () => {
		expect(read(moveGroup(template, "M", "up"))).toEqual(read(template));
		expect(read(moveGroup(template, "V", "down"))).toEqual(read(template));
		expect(read(moveGroup(template, "X", "down"))).toEqual(read(template));
	});
});

describe("placePoint", () => {
	test("puts a point that changes group last in the other", () => {
		expect(read(placePoint(template, 1, "V"))).toEqual(["M:2", "E:3", "V:4", "V:5", "V:1"]);
		expect(read(placePoint(template, 5, "M"))).toEqual(["M:1", "M:2", "M:5", "E:3", "V:4"]);
	});

	test("starts a new group at the end", () => {
		expect(read(placePoint(template, 3, "Afronding"))).toEqual([
			"M:1",
			"M:2",
			"V:4",
			"V:5",
			"Afronding:3",
		]);
	});

	test("leaves a point in its own group where it is", () => {
		expect(read(placePoint(template, 1, "M"))).toEqual(read(template));
	});

	test("adds a new point last in its group", () => {
		expect(read(placePoint(template, 0, "E"))).toEqual(["M:1", "M:2", "E:3", "E:0", "V:4", "V:5"]);
	});
});

describe("changedPlaces", () => {
	test("lists only the points whose group or position changes, numbered from 0", () => {
		expect(changedPlaces(template, movePoint(template, 2, "up"))).toEqual([
			{ id: 2, group: "M", position: 0 },
			{ id: 1, group: "M", position: 1 },
		]);
		expect(changedPlaces(template, movePoint(template, 4, "up"))).toEqual([
			{ id: 4, group: "E", position: 3 },
		]);
		expect(changedPlaces(template, template)).toEqual([]);
	});

	test("renumbers points with gaps or ties between them", () => {
		const gaps = [
			{ id: 1, group: "", position: 3 },
			{ id: 2, group: "", position: 7 },
		];
		expect(changedPlaces(gaps, orderPoints(gaps))).toEqual([
			{ id: 1, group: "", position: 0 },
			{ id: 2, group: "", position: 1 },
		]);
	});
});

describe("checklists on orders", () => {
	test("an inspection or maintenance order's units get them, while it's to be done", () => {
		expect(checklistKind("inspection")).toBe("inspection");
		expect(checklistKind("maintenance")).toBe("maintenance");
		expect(checklistKind("repair")).toBeNull();
		expect(checklistKind("breakdown")).toBeNull();
		for (const status of ["quote", "scheduled", "in_progress"] as const) {
			expect(getsChecklists(status), status).toBe(true);
		}
		for (const status of ["completed", "invoiced", "cancelled"] as const) {
			expect(getsChecklists(status), status).toBe(false);
		}
	});

	test("completing needs every point answered, and a remark with each rejection", () => {
		const answers = [
			{ result: "ok" as const, remark: null },
			{ result: "nok" as const, remark: "  " },
			{ result: null, remark: null },
		];
		expect(completionProblems(answers)).toEqual({ unanswered: 1, unexplained: 1 });
		expect(canComplete(answers)).toBe(false);
		expect(progress(answers)).toEqual({ answered: 2, total: 3 });
		const done = [
			{ result: "ok" as const, remark: null },
			{ result: "nok" as const, remark: "Draadbreuk bij trommel" },
			{ result: "na" as const, remark: null },
		];
		expect(completionProblems(done)).toEqual({ unanswered: 0, unexplained: 0 });
		expect(canComplete(done)).toBe(true);
		expect(rejections(done)).toBe(1);
		// A checklist without points has nothing to complete.
		expect(canComplete([])).toBe(false);
	});

	test("rejected points come first, each in its own order", () => {
		const points = [
			{ id: 1, result: "ok" as const },
			{ id: 2, result: "nok" as const },
			{ id: 3, result: null },
			{ id: 4, result: "nok" as const },
		];
		expect(rejectedFirst(points).map((point) => point.id)).toEqual([2, 4, 1, 3]);
	});

	test("a checklist's score is the share of OK among the points found OK or rejected", () => {
		const found = (ok: number, nok: number, na = 0, open = 0) => [
			...Array.from({ length: ok }, () => ({ result: "ok" as const })),
			...Array.from({ length: nok }, () => ({ result: "nok" as const })),
			...Array.from({ length: na }, () => ({ result: "na" as const })),
			...Array.from({ length: open }, () => ({ result: null })),
		];
		// The client's example: passed 4 points and failed 6.
		expect(checklistScore(found(4, 6))).toBe(40);
		expect(checklistScore(found(9, 0))).toBe(100);
		expect(checklistScore(found(0, 3))).toBe(0);
		// N.v.t. and unanswered points don't count.
		expect(checklistScore(found(4, 6, 5, 2))).toBe(40);
		// Rounded to a whole percent: 2 of 3 is 67%, 1 of 3 is 33%, 1 of 8 is 13%.
		expect(checklistScore(found(2, 1))).toBe(67);
		expect(checklistScore(found(1, 2))).toBe(33);
		expect(checklistScore(found(1, 7))).toBe(13);
		// None when no point counts.
		expect(checklistScore(found(0, 0, 3))).toBeNull();
		expect(checklistScore([])).toBeNull();
	});
});

describe("a unit's inspection status", () => {
	const until = day("2027-03-15");
	const latest = { validUntil: until, rejected: false };

	test("valid until its last day, expiring in the 30 days before it, expired after", () => {
		expect(inspectionStatus(latest, day("2026-03-15"))).toBe("valid");
		expect(inspectionStatus(latest, day("2027-02-12"))).toBe("valid");
		// 30 days before the last valid day: expiring.
		expect(inspectionStatus(latest, day("2027-02-13"))).toBe("expiring");
		expect(inspectionStatus(latest, day("2027-03-15"))).toBe("expiring");
		expect(inspectionStatus(latest, day("2027-03-16"))).toBe("expired");
	});

	test("rejected when it rejected a point, unless it has expired", () => {
		const rejected = { ...latest, rejected: true };
		expect(inspectionStatus(rejected, day("2026-06-01"))).toBe("rejected");
		expect(inspectionStatus(rejected, day("2027-03-01"))).toBe("rejected");
		expect(inspectionStatus(rejected, day("2027-03-16"))).toBe("expired");
	});

	test("none without a completed inspection", () => {
		expect(inspectionStatus(null, day("2026-10-17"))).toBe("none");
	});

	test("valid for the template's months from the day it was completed", () => {
		expect(validUntil(day("2026-10-17"), 12)).toEqual(day("2027-10-17"));
		expect(validUntil(day("2026-10-17"), 6)).toEqual(day("2027-04-17"));
		// A shorter month: its last day.
		expect(validUntil(day("2027-01-31"), 1)).toEqual(day("2027-02-28"));
	});
});

describe("the work orders page's checklist of a unit this year", () => {
	/** Checklists newest first: `[id, status, open, completed year]`. */
	const checklists = (...rows: [number, "draft" | "completed", boolean, number | null][]) =>
		rows.map(([id, status, open, completedYear]): YearChecklist => ({
			id,
			status,
			open,
			completedYear,
		}));

	test("the open draft first, else the newest completed this year", () => {
		const list = checklists([4, "completed", false, 2026], [3, "draft", true, null]);
		expect(shownChecklist(list, 2026)?.id).toBe(3);
		expect(
			shownChecklist(checklists([4, "completed", false, 2026], [2, "completed", false, 2026]), 2026)
				?.id,
		).toBe(4);
	});

	test("none for a year without one: a draft on a closed order or last year's doesn't count", () => {
		const list = checklists([5, "draft", false, null], [1, "completed", false, 2025]);
		expect(shownChecklist(list, 2026)).toBeNull();
		expect(shownChecklist([], 2026)).toBeNull();
	});

	test("the one asked for, if it's the unit's", () => {
		const list = checklists([3, "draft", true, null], [1, "completed", false, 2025]);
		expect(shownChecklist(list, 2026, 1)?.id).toBe(1);
		// Another unit's (or a made-up id): as if none were asked for.
		expect(shownChecklist(list, 2026, 99)?.id).toBe(3);
	});

	test("a year's bounds are its first moments, in the time zone", () => {
		const { start, end } = yearBounds(2026, "Europe/Amsterdam");
		expect(start.toString()).toBe("2025-12-31T23:00:00Z");
		expect(end.toString()).toBe("2026-12-31T23:00:00Z");
	});

	test("a component's points are those copied from the template points that check it", () => {
		const points = [
			{ id: 1, templateItemId: 10 },
			{ id: 2, templateItemId: 11 },
			{ id: 3, templateItemId: null },
			{ id: 4, templateItemId: 12 },
		];
		expect(componentPoints(points, [12, 10])).toEqual({
			points: [points[0], points[3]],
			others: 2,
		});
		expect(componentPoints(points, [])).toEqual({ points: [], others: 4 });
	});
});
