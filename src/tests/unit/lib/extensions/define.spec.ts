import type { Component } from "svelte";
import { expect, test } from "vite-plus/test";

import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import {
	bulkContribution,
	bulkRows,
	defineBulkTable,
	defineRecordPoints,
	defineSlot,
	slotContribution,
	slotProps,
} from "#lib/extensions/define.ts";
import type { ModuleId } from "#lib/modules/ids.ts";

// Made-up points and modules: the type check (svelte-check) runs the `@ts-expect-error`s below.
const side = defineSlot<{ number: string }>("orders.detail.side");
const table = defineBulkTable<{ id: number; number: string }>("orders.list.bulk");
const widgets = "widgets" as ModuleId;

const component = <Props extends Record<string, unknown>>() =>
	Promise.resolve({ default: {} as Component<Props> });
const actions = <Row>() => Promise.resolve({ default: [] as BulkAction<Row, AnyListWhere>[] });

test("a slot contribution is known by its module, point and name", () => {
	const contribution = slotContribution(side, widgets, "card", component<{ number: string }>);
	expect(contribution).toMatchObject({
		id: "widgets/orders.detail.side/card",
		module: "widgets",
		point: "orders.detail.side",
	});
});

test("a slot takes a component that needs no more than the props it passes", () => {
	const contributions = [
		slotContribution(side, widgets, "card", component<{ number: string; size?: number }>),
		slotContribution(side, widgets, "card", component<{ number?: string }>),
		// @ts-expect-error the slot doesn't pass `serial`
		slotContribution(side, widgets, "card", component<{ number: string; serial: string }>),
		// @ts-expect-error the slot passes `number` as a string
		slotContribution(side, widgets, "card", component<{ number: number }>),
	];
	// Only the type check tells them apart.
	expect(new Set(contributions.map(({ point }) => point))).toEqual(new Set([side.id]));
});

test("a bulk contribution is known by its module and table", () => {
	expect(bulkContribution(table, widgets, actions<{ id: number }>)).toMatchObject({
		id: "widgets/orders.list.bulk",
		module: "widgets",
		point: "orders.list.bulk",
	});
});

test("a table takes bulk actions that need no more of a row than it has", () => {
	const contributions = [
		bulkContribution(table, widgets, actions<{ id: number; number: string }>),
		bulkContribution(table, widgets, actions<{ id: number }>),
		// @ts-expect-error the table's rows have no `customer`
		bulkContribution(table, widgets, actions<{ id: number; customer: string }>),
	];
	// Only the type check tells them apart.
	expect(new Set(contributions.map(({ point }) => point))).toEqual(new Set([table.id]));
});

test("a record's points are named alike for every domain, with the list's it asks for", () => {
	const orders = defineRecordPoints("orders", {
		detail: slotProps<{ number: string }>(),
		bulk: bulkRows<{ id: number; number: string }>(),
	});
	expect(orders).toEqual({
		detail: {
			main: { id: "orders.detail.main", kind: "slot" },
			side: { id: "orders.detail.side", kind: "slot" },
		},
		list: { bulk: { id: "orders.list.bulk", kind: "bulk" } },
	});
	const equipment = defineRecordPoints("equipment", {
		detail: slotProps<{ serialNumber: string }>(),
		listColumns: true,
	});
	expect(equipment.list).toEqual({ columns: { id: "equipment.list.columns", kind: "columns" } });
	const engineers = defineRecordPoints("engineers", { detail: slotProps<{ id: number }>() });
	expect(engineers.list).toEqual({});

	// The points carry their types: the slots' props and the table's rows.
	slotContribution(orders.detail.side, widgets, "card", component<{ number: string }>);
	// @ts-expect-error the order's slots pass `number`, not `id`
	slotContribution(orders.detail.main, widgets, "card", component<{ id: number }>);
	bulkContribution(orders.list.bulk, widgets, actions<{ id: number }>);
	// @ts-expect-error a list without `bulk` has no bulk table
	expect(engineers.list.bulk).toBeUndefined();
	// @ts-expect-error a list without `listColumns` takes no columns
	expect(orders.list.columns).toBeUndefined();
});
