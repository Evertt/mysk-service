import { describe, expect, test } from "vite-plus/test";

import { fixtureOrders, runQuery } from "#wiki/widgets/tenancy-simulator/tenancy.ts";

const southId = fixtureOrders.find((order) => order.organization === "South")!.id;

describe("the tenancy simulator", () => {
	test("its fixture has three orders of each tenant", () => {
		expect(fixtureOrders.filter((order) => order.organization === "North")).toHaveLength(3);
		expect(fixtureOrders.filter((order) => order.organization === "South")).toHaveLength(3);
	});

	test("unscoped, North reads every tenant's orders", () => {
		const answer = runQuery({ tenant: "North", scoped: false });
		expect(answer).toMatchObject({ rows: fixtureOrders });
		expect("rows" in answer && answer.rows).toHaveLength(6);
		expect(answer.sql).not.toContain("inTenant");
	});

	test("scoped with inTenant(), North reads its own three", () => {
		const answer = runQuery({ tenant: "North", scoped: true });
		expect("rows" in answer && answer.rows.map((order) => order.organization)).toEqual([
			"North",
			"North",
			"North",
		]);
		expect(answer.sql).toContain("inTenant(order)");
	});

	test("scoped, a South id tampered into North's request is a 404", () => {
		const answer = runQuery({ tenant: "North", scoped: true, id: southId });
		expect(answer).toMatchObject({ refused: 404 });
		expect(answer.sql).toContain(`idInTenant(order, ${southId})`);
	});

	test("unscoped, that id leaks the South order: the leak the scope prevents", () => {
		const answer = runQuery({ tenant: "North", scoped: false, id: southId });
		expect(answer).toEqual({
			rows: [fixtureOrders.find((order) => order.id === southId)],
			sql: expect.stringContaining(`eq(order.id, ${southId})`),
		});
	});

	test("scoped, South reads its own order by its id", () => {
		const answer = runQuery({ tenant: "South", scoped: true, id: southId });
		expect("rows" in answer && answer.rows.map((order) => order.id)).toEqual([southId]);
	});
});
