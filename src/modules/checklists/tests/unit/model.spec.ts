import { describe, expect, test } from "vite-plus/test";

import {
	canComplete,
	changedPlaces,
	checklistKind,
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
	validUntil,
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
