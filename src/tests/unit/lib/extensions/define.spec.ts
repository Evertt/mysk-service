import type { Component } from "svelte";
import { expect, test } from "vite-plus/test";

import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import type { ModuleId } from "#lib/modules/ids.ts";

import { bulkContribution, defineBulkTable, defineSlot, slotContribution } from "./define.ts";

// Made-up points and modules: the type check (svelte-check) runs the `@ts-expect-error`s below.
const side = defineSlot<{ number: string }>("orders.detail.side");
const table = defineBulkTable<{ id: number; number: string }>("orders.list");
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
		id: "widgets/orders.list",
		module: "widgets",
		point: "orders.list",
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
