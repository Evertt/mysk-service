import type { Component } from "svelte";
import { expect, test } from "vite-plus/test";

import { isCurrentAt, type NavGroup, type NavItem, placeNav } from "#lib/modules/nav.ts";

const item = (id: string): NavItem => ({
	id,
	title: id,
	href: `/${id}`,
	icon: {} as Component,
});
const mod = (id: string, after?: string) => ({ ...item(id), after });
/** Each group's item ids. */
const ids = (groups: NavGroup[]) => groups.map((group) => group.items.map((entry) => entry.id));

const core: NavGroup[] = [
	{ label: "Operations", items: [item("dashboard"), item("orders"), item("activity")] },
	{ label: "Records", items: [item("customers")] },
];

test("a module goes after the entry it names, the others in the modules group", () => {
	expect(ids(placeNav(core, [mod("contracts"), mod("schedule", "orders")], "Modules"))).toEqual([
		["dashboard", "orders", "schedule", "activity"],
		["customers"],
		["contracts"],
	]);
});

test("modules after the same entry keep registry order", () => {
	expect(ids(placeNav(core, [mod("a", "orders"), mod("b", "orders")], "Modules"))[0]).toEqual([
		"dashboard",
		"orders",
		"a",
		"b",
		"activity",
	]);
});

test("a module may go after a module that comes later in registry order", () => {
	expect(ids(placeNav(core, [mod("b", "a"), mod("a", "orders")], "Modules"))[0]).toEqual([
		"dashboard",
		"orders",
		"a",
		"b",
		"activity",
	]);
});

test("a chain after an entry stays together", () => {
	// c goes after a, which goes after Orders; b after Orders comes behind both.
	expect(
		ids(placeNav(core, [mod("a", "orders"), mod("c", "a"), mod("b", "orders")], "Modules"))[0],
	).toEqual(["dashboard", "orders", "a", "c", "b", "activity"]);
});

test("a module whose entry isn't shown goes in the modules group", () => {
	const groups = placeNav(core, [mod("b", "a"), mod("c", "nowhere")], "Modules");
	expect(groups.at(-1)).toMatchObject({ label: "Modules" });
	expect(ids(groups).at(-1)).toEqual(["b", "c"]);
});

test("without modules there's no modules group, and the core groups are left as they were", () => {
	expect(placeNav(core, [], "Modules")).toEqual(core);
	expect(ids(core)[0]).toEqual(["dashboard", "orders", "activity"]);
	placeNav(core, [mod("a", "orders")], "Modules");
	expect(ids(core)[0]).toEqual(["dashboard", "orders", "activity"]);
});

test("an empty group is left out", () => {
	expect(placeNav([{ label: "Empty", items: [] }], [], "Modules")).toEqual([]);
});

test("an entry is current on its page and those under it, a home's on its own only", () => {
	const orders = item("orders");
	expect(isCurrentAt("/orders", orders)).toBe(true);
	expect(isCurrentAt("/orders/ORD-1", orders)).toBe(true);
	expect(isCurrentAt("/orders-archive", orders)).toBe(false);
	const home = { ...item("portal"), exact: true };
	expect(isCurrentAt("/portal", home)).toBe(true);
	expect(isCurrentAt("/portal/orders", home)).toBe(false);
});

test("an entry is current on its other paths too", () => {
	const equipment = { ...item("equipment"), also: ["/locations"] };
	expect(isCurrentAt("/locations", equipment)).toBe(true);
	expect(isCurrentAt("/locations/12", equipment)).toBe(true);
	expect(isCurrentAt("/orders", equipment)).toBe(false);
});
