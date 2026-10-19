/**
 * The condition module's lists and counts on the seeded demo database: the Connect page's rows (a
 * component of a unit in care each, and each unit without components), worst first, with their
 * counts by status and by customer, filtered by customer, status and band, sorted by condition; the
 * dashboard's tile; a customer's service history; the customer filter's options, counted under the
 * other filters; the equipment list's condition columns; and North
 * never seeing SHLTR's, also by a customer's code. Each status worked out in SQL is checked against
 * the module's pure rules (`support.ts`). The server side of `condition.test.ts`,
 * `condition.office.test.ts` and `condition.tenancy.test.ts`, which keep the pages.
 */
import { describe, expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { getEquipmentList } from "#lib/equipment/list/equipment-list.remote.ts";
import { equipmentList } from "#lib/equipment/list/equipment-list.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { searchMatch } from "#lib/server/lists/index.ts";
import { getServiceHistory } from "#modules/condition/feed.remote.ts";
import {
	getConditionCounts,
	getConditionCustomerOptions,
	getConditionUnits,
} from "#modules/condition/list/units-list.remote.ts";
import { conditionList } from "#modules/condition/list/units-list.ts";
import { getConditionOverview } from "#modules/condition/overview.remote.ts";
import { rowsSql } from "#modules/condition/server/list-sql.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	shltr,
	value,
} from "#unit/lib/server/harness/index.ts";

import { countsOf, rank, rowsOf, unitStates } from "./support.ts";

const [northId, shltrId] = [organizationId("north"), organizationId("shltr")];

/** The Connect list's query of a link to the page with `search`. */
const queryOf = (search: string) =>
	toListQuery(conditionList, parseTableUrl(new URLSearchParams(search), conditionList.urlSpec));

/** The first page of the Connect list a link with `search` opens, as `actor`. */
const listed = (search: string, actor: Actor = shltr.member) =>
	as(actor, () => data(getConditionUnits, queryOf(search)));

/** The counts of the Connect list a link with `search` shows, as `actor`. */
const countsFor = (search: string, actor: Actor = shltr.member) =>
	as(actor, () => {
		const { q, filters } = queryOf(search);
		return data(getConditionCounts, { q, filters });
	});

/** The customer filter's options on the Connect list a link with `search` shows, as `actor`. */
const customerOptionsFor = (
	search: string,
	actor: Actor = shltr.member,
	selected: string[] = [],
	term = "",
) =>
	as(actor, () => {
		const { q, filters } = queryOf(search);
		return data(getConditionCustomerOptions, { where: { q, filters }, search: term, selected });
	});

/** The code of SHLTR's customer Riedel B.V. */
const riedel = () =>
	value<string>(`select code from customer where organization_id = ? and name = 'Riedel B.V.'`, [
		shltrId,
	]);

/** The equipment list's query with the condition columns' `filters` and `sort`. */
const equipmentQuery = (filters: Record<string, string[]>, sort: string | null = null) =>
	({
		q: "",
		filters,
		sort: sort ? [{ id: sort, desc: false }] : [],
		group: null,
		pageIndex: 0,
		pageSize: equipmentList.pageSize,
	}) as unknown as Parameters<typeof getEquipmentList>[0];

describe("the Connect page, in SHLTR", () => {
	test("has a row per component of a unit in care, and one per unit without, worst first", async () => {
		const rows = rowsOf(await unitStates(shltrId));
		const { rows: shown, rowCount } = await listed("");
		expect(rowCount).toBe(rows.length);
		expect(shown[0].status).toBe("critical");
		const ranks = shown.map((row) => rank[row.status]);
		expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
		// The seed shows every status, counted as the rules have them.
		const counts = countsOf(rows);
		for (const status of ["critical", "attention", "planned", "ok"]) {
			expect(counts[status], status).toBeGreaterThan(0);
		}
		expect((await countsFor("")).status).toEqual(counts);
	});

	test("a customer's rows and counts; the mockup's worn spring set with its article and advice", async () => {
		const code = await riedel();
		const theirs = rowsOf(await unitStates(shltrId)).filter((row) => row.unit.customer === code);
		const { rows: shown, rowCount } = await listed(`customer=${code}`);
		expect(rowCount).toBe(theirs.length);
		const counts = await countsFor(`customer=${code}`);
		expect(counts.status).toEqual(countsOf(theirs));
		expect(counts.customers.find((each) => each.code === code)).toMatchObject({
			name: "Riedel B.V.",
			count: theirs.length,
		});
		expect(shown.find((row) => row.component?.number === "OC-1041")).toMatchObject({
			name: "Sectionaaldeur laaddok 07",
			score: 22,
			status: "critical",
			advice: "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.",
			component: { name: "Torsieveerpakket", sku: "SD-001" },
		});
		// A unit without components is a row of its own, as a whole.
		expect((await listed("")).rows.some((row) => row.component === null)).toBe(true);
	});

	test("the customer filter counts each customer's rows under the other filters, most first", async () => {
		const search = "status=critical,attention";
		const { customers } = await countsFor(search);
		const options = await customerOptionsFor(search);
		const counted = options.options.filter((option) => option.count);
		// As the chips count them, most first, then by name.
		expect(counted.map((option) => [option.value, option.count])).toEqual(
			customers
				.toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name))
				.slice(0, 20)
				.map((chip) => [chip.code, chip.count]),
		);
		// Those without such rows follow, with 0; ticking one doesn't change the counts.
		expect(options.options.slice(counted.length).every((option) => option.count === 0)).toBe(true);
		expect((await customerOptionsFor(`${search}&customer=${await riedel()}`)).options).toEqual(
			options.options,
		);
	});

	test("only what needs attention, when asked; the tiles still count every status", async () => {
		const rows = rowsOf(await unitStates(shltrId));
		const counts = countsOf(rows);
		const { rows: shown, rowCount } = await listed("status=critical,attention");
		expect(rowCount).toBe(counts.critical + counts.attention);
		expect(new Set(shown.map((row) => row.status))).toEqual(new Set(["critical", "attention"]));
		expect((await countsFor("status=critical,attention")).status).toEqual(counts);
	});

	test("sorts by condition, the lowest first, the rows without one last", async () => {
		const rows = rowsOf(await unitStates(shltrId));
		const { rows: shown } = await listed("sort=condition");
		const scores = shown.flatMap((row) => (row.score === null ? [] : [row.score]));
		expect(scores.length).toBeGreaterThan(0);
		expect(scores).toEqual(scores.toSorted((a, b) => a - b));
		expect(scores[0]).toBe(Math.min(...rows.flatMap((row) => row.score ?? [])));
		const firstWithout = shown.findIndex((row) => row.score === null);
		if (firstWithout >= 0)
			expect(shown.slice(firstWithout).every((r) => r.score === null)).toBe(true);
	});

	test("filters by the condition's band", async () => {
		const rows = rowsOf(await unitStates(shltrId));
		const { rowCount } = await listed("condition=low");
		expect(rowCount).toBe(rows.filter((row) => row.score !== null && row.score < 40).length);
		const none = await listed("condition=none");
		expect(none.rowCount).toBe(rows.filter((row) => row.score === null).length);
	});

	test("a search binds each word once, whatever the columns it searches", async () => {
		const binds = await as(shltr.member, () => {
			const where = searchMatch(rowsSql().search, "a b c d e f g h i j");
			return db.select({ id: equipment.id }).from(equipment).where(where).toSQL().params.length;
		});
		expect(binds).toBe(10);
	});

	test("a long search, each word in any of the columns, with every filter and a sort", async () => {
		const code = await riedel();
		const [spring] = (await listed(`customer=${code}`)).rows.filter(
			(row) => row.component?.number === "OC-1041",
		);
		const words = [
			"torsieveerpakket",
			"oc-1041",
			spring.serialNumber,
			"laaddok",
			"07",
			spring.manufacturer,
			spring.model,
			"riedel",
			code,
			"B.V.",
		];
		const filters = `customer=${code}&status=critical,attention&condition=low,fair&sort=condition`;
		const search = `q=${encodeURIComponent(words.join(" "))}&${filters}`;
		const { rows, rowCount } = await listed(search);
		expect(rows.map((row) => row.component?.number)).toEqual(["OC-1041"]);
		expect(rowCount).toBe(1);
		expect((await countsFor(search)).status).toMatchObject({ critical: 1 });
		// A word is never found across two of a row's values (its unit's name and manufacturer).
		const across = `07${spring.manufacturer.slice(0, 3)}`;
		expect((await listed(`q=${encodeURIComponent(`oc-1041 ${across}`)}`)).rowCount).toBe(0);
	});

	test("the dashboard's tile counts the units that need attention, their components taken in", async () => {
		const counts = countsOf(await unitStates(shltrId));
		expect(await as(shltr.member, () => data(getConditionOverview))).toEqual({
			critical: counts.critical,
			attention: counts.attention,
		});
	});

	test("a customer's service history is its units' latest conditions, orders and checklists", async () => {
		const code = await riedel();
		const history = await as(shltr.member, () =>
			data(getServiceHistory, { customer: code, limit: 10 }),
		);
		expect(history.customer).toBe("Riedel B.V.");
		expect(history.entries).toHaveLength(10);
		const kinds = new Set(history.entries.map((entry) => entry.kind));
		expect(kinds).toContain("condition");
		expect(kinds).toContain("order");
		expect(
			await as(shltr.member, () => call(getServiceHistory, { customer: "NOPE", limit: 10 })),
		).toMatchObject({ status: 404 });
	});
});

describe("the equipment list's condition columns, in North", () => {
	test("filter by the status, in the database", async () => {
		const critical = (await unitStates(northId, true)).filter((unit) => unit.status === "critical");
		expect(critical.length).toBeGreaterThan(0);
		const { rows: shown, rowCount } = await as(north.member, () =>
			data(getEquipmentList, equipmentQuery({ "condition.status": ["critical"] })),
		);
		expect(rowCount).toBe(critical.length);
		for (const row of shown) {
			expect(row.moduleValues["condition.status"], row.serialNumber).toMatchObject({
				status: "critical",
			});
		}
	});

	test("sort by condition, the lowest first, the units without one last", async () => {
		const recorded = (await unitStates(northId, true))
			.flatMap((unit) => unit.score ?? [])
			.toSorted((a, b) => a - b);
		const { rows: shown } = await as(north.member, () =>
			data(getEquipmentList, equipmentQuery({}, "condition.score")),
		);
		const scores = shown.map(
			(row) => (row.moduleValues["condition.score"] as { score: number } | null)?.score ?? null,
		);
		const scored = scores.filter((score) => score !== null);
		expect(scored).toEqual(recorded.slice(0, scored.length));
		expect(scores.slice(scored.length).every((score) => score === null)).toBe(true);
	});

	test("filter by the condition's band", async () => {
		const units = await unitStates(northId, true);
		const { rowCount } = await as(north.member, () =>
			data(getEquipmentList, equipmentQuery({ "condition.score": ["low", "fair"] })),
		);
		expect(rowCount).toBe(units.filter((unit) => unit.score !== null && unit.score < 70).length);
	});
});

describe("SHLTR's units, to North", () => {
	test("aren't on its Connect page, nor counted, nor in a customer's history, also by Riedel's code", async () => {
		const units = await unitStates(northId);
		const rows = rowsOf(units);
		expect((await listed("", north.member)).rowCount).toBe(rows.length);
		expect((await countsFor("", north.member)).status).toEqual(countsOf(rows));
		const counts = countsOf(units);
		expect(await as(north.member, () => data(getConditionOverview))).toEqual({
			critical: counts.critical ?? 0,
			attention: counts.attention ?? 0,
		});
		// Riedel's code is North's own customer's too: that one's, then.
		const code = await riedel();
		const own = await value<string>(
			`select name from customer where organization_id = ? and code = ?`,
			[northId, code],
		);
		const theirs = rows.filter((row) => row.unit.customer === code);
		const shown = await listed(`customer=${code}`, north.member);
		expect(shown.rowCount).toBe(theirs.length);
		expect(new Set(shown.rows.map((row) => row.customer.name))).toEqual(new Set([own]));
		// The chips count each of North's customers (not narrowed by their own filter).
		const chips = (await countsFor(`customer=${code}`, north.member)).customers;
		expect(chips.find((chip) => chip.code === code)).toEqual({
			code,
			name: own,
			count: theirs.length,
		});
		expect(chips.map((chip) => chip.name)).not.toContain("Riedel B.V.");
		// Nor does the customer filter offer or count SHLTR's, searched or ticked by its code.
		const options = await customerOptionsFor(`customer=${code}`, north.member, [code], "Riedel");
		expect(options.options).toEqual([]);
		expect(options.selected).toEqual([{ value: code, label: own, count: theirs.length }]);
		const history = await as(north.member, () =>
			data(getServiceHistory, { customer: code, limit: 10 }),
		);
		expect(history.customer).toBe(own);
	});
});
