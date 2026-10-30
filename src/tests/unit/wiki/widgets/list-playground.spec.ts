import { describe, expect, test } from "vite-plus/test";

import { orderStatuses } from "#lib/models.ts";
import {
	fixtureRows,
	playground,
	type PlaygroundRow,
} from "#wiki/widgets/list-playground/list-playground.ts";

describe("the list playground's fixture", () => {
	test("has 25 rows with unique ids and numbers", () => {
		expect(fixtureRows).toHaveLength(25);
		expect(new Set(fixtureRows.map((row) => row.id)).size).toBe(25);
		expect(new Set(fixtureRows.map((row) => row.number)).size).toBe(25);
	});

	test("uses the app's order statuses, and every one of them at least once", () => {
		const used = new Set(fixtureRows.map((row) => row.status));
		expect([...used].every((status) => orderStatuses.includes(status))).toBe(true);
		expect(orderStatuses.filter((status) => !used.has(status))).toEqual([]);
	});
});

describe("the list playground", () => {
	test("without a search or filter it shows all the rows in one group", () => {
		const { groups, total } = playground(fixtureRows, {});
		expect(total).toBe(25);
		expect(groups).toHaveLength(1);
		expect(groups[0].status).toBeNull();
		expect(groups[0].rows).toHaveLength(25);
	});

	test("a search keeps the rows where each word is in some column, in any case", () => {
		const customer = fixtureRows[0].customer;
		const [first, second] = [customer.split(" ")[0].toUpperCase(), fixtureRows[0].number.slice(-3)];
		const { groups } = playground(fixtureRows, { search: ` ${first}   ${second} ` });
		expect(groups[0].rows.map((row) => row.id)).toContain(fixtureRows[0].id);
		for (const row of groups[0].rows) {
			const text = `${row.number} ${row.customer} ${row.site}`.toLowerCase();
			expect(text).toContain(first.toLowerCase());
			expect(text).toContain(second.toLowerCase());
		}
	});

	test("a search that matches nothing leaves no rows", () => {
		const { groups, total } = playground(fixtureRows, { search: "zzzzzz" });
		expect(total).toBe(0);
		expect(groups.flatMap((group) => group.rows)).toEqual([]);
	});

	test("a status filter keeps that status only, and combines with the search", () => {
		const scheduled = playground(fixtureRows, { status: "scheduled" });
		expect(scheduled.groups[0].rows.every((row) => row.status === "scheduled")).toBe(true);
		expect(scheduled.total).toBe(fixtureRows.filter((row) => row.status === "scheduled").length);

		const none = playground(fixtureRows, { status: "scheduled", search: "zzzzzz" });
		expect(none.total).toBe(0);
	});

	test("grouped by status, there is a group per status present, in the lifecycle's order", () => {
		const { groups, total } = playground(fixtureRows, { grouped: true });
		expect(groups.map((group) => group.status)).toEqual(
			orderStatuses.filter((status) => fixtureRows.some((row) => row.status === status)),
		);
		expect(groups.flatMap((group) => group.rows)).toHaveLength(total);
		for (const group of groups) {
			expect(group.rows.every((row: PlaygroundRow) => row.status === group.status)).toBe(true);
		}
	});

	test("groups follow the filters: a group with no matching row is gone", () => {
		const { groups } = playground(fixtureRows, { grouped: true, status: "completed" });
		expect(groups.map((group) => group.status)).toEqual(["completed"]);
	});

	test("rows keep their given order within a group", () => {
		const { groups } = playground(fixtureRows, { grouped: true });
		for (const group of groups) {
			const ids = group.rows.map((row) => row.id);
			expect(ids).toEqual(ids.toSorted((a, b) => a - b));
		}
	});
});
