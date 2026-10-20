/**
 * Made-up modules for the specs of the core, which test its extension points (slots, activity
 * subjects and verbs) without the real modules in `src/modules`: a spec mocks the registry with
 * them, `vi.mock("#lib/modules/manifests.gen.ts", async () => ({ manifests: fakeModules }))`
 * (and `#lib/extensions/contributions.gen.ts` with their contributions), or passes them where a
 * function takes a registry. What a real module does is tested in its own folder.
 */
import type { Component } from "svelte";

import type { Sentence } from "#lib/activity/index.ts";
import { oneOf } from "#lib/components/data-table/list-definition.ts";
import { listColumn } from "#lib/components/data-table/module-columns.ts";
import { cards } from "#lib/dashboard/extensions.ts";
import { points as equipmentPoints } from "#lib/equipment/extensions.ts";
import { columnsContribution, slotContribution } from "#lib/extensions/define.ts";
import type { ModuleGraph } from "#lib/modules/graph.ts";
import type { AppModule, ModuleId } from "#lib/modules/manifests.ts";
import { points as orderPoints } from "#lib/orders/extensions.ts";

const loader = () => Promise.resolve({ default: {} as Component });
const sentence =
	(verb: string): Sentence =>
	(inputs) =>
		`${inputs.user} ${verb} ${inputs.subject}`;

/** A module with slots (see `fakeSlotContributions`), activity subjects and a verb. */
export const widgets = {
	id: "widgets" as ModuleId,
	label: "Widgets",
	description: "Makes widgets",
	icon: {} as Component,
	subjects: {
		widget: {
			noun: () => "widget",
			href: ({ label }) => `/widgets/${label}`,
			fields: {
				customerId: { ref: "customer" },
				equipmentIds: { ref: "equipment" },
				size: { label: () => "size of the widget", format: (value) => `${String(value)} cm` },
			},
		},
		// A part of a unit, on its page.
		widget_part: { noun: () => "widget part", onParentPage: true },
	},
	actions: { approved: sentence("approved") },
} satisfies AppModule;

/** A module that only has a slot on the dashboard and one on a unit of equipment's page. */
export const gadgets = {
	id: "gadgets" as ModuleId,
	label: "Gadgets",
	description: "Makes gadgets",
	icon: {} as Component,
} satisfies AppModule;

/**
 * A module whose component on an order's page never loads, like a chunk that fails to download
 * (`gizmosOrderCard`). Not in `fakeModules`: a spec that renders slots adds it where it needs a
 * failing one.
 */
export const gizmos = {
	id: "gizmos" as ModuleId,
	label: "Gizmos",
	description: "Makes gizmos",
	icon: {} as Component,
} satisfies AppModule;

/**
 * A module with a component on an order's page that a spec's tenant doesn't have, to see that a
 * slot leaves it out. Not in `fakeModules`.
 */
export const dormant = {
	id: "dormant" as ModuleId,
	label: "Dormant",
	description: "Makes nothing",
	icon: {} as Component,
} satisfies AppModule;

/** The fake registry, in registry order. */
export const fakeModules = [gadgets, widgets] as const;

/**
 * The fake modules' components, as `contributions.gen.ts` lists them, in registry order: gadgets'
 * on the dashboard and a unit of equipment's page, widgets' on the dashboard and an order's page.
 */
export const fakeSlotContributions = [
	slotContribution(cards, gadgets.id, "card", loader),
	slotContribution(equipmentPoints.detail.side, gadgets.id, "card", loader),
	slotContribution(cards, widgets.id, "card", loader),
	slotContribution(orderPoints.detail.side, widgets.id, "card", loader),
];

/** Gizmos' component on an order's page, which never loads. */
export const gizmosOrderCard = slotContribution(orderPoints.detail.side, gizmos.id, "card", () =>
	Promise.reject(new Error("Failed to fetch dynamically imported module")),
);

/** Gadgets' column in the equipment list: a rating, sorted, and filtered by `high` and `low`. */
export const gadgetsRating = listColumn<number | null, "high" | "low">({
	id: "gadgets.rating",
	param: "rating",
	label: () => "Rating",
	sort: true,
	filter: oneOf(["high", "low"]),
	optionLabel: (value) => (value === "high" ? "High" : "Low"),
	cell: {} as Component<{ value: number | null }>,
	align: "end",
});

/** Widgets' column in the equipment list: shown only, neither sorted nor filtered. */
export const widgetsNote = listColumn<string | null>({
	id: "widgets.note",
	param: "note",
	label: () => "Note",
	cell: {} as Component<{ value: string | null }>,
});

/** The fake modules' columns, as `contributions.gen.ts` lists them, in registry order. */
export const fakeColumnContributions = [
	columnsContribution(equipmentPoints.list.columns, gadgets.id, () =>
		Promise.resolve({ default: [gadgetsRating] }),
	),
	columnsContribution(equipmentPoints.list.columns, widgets.id, () =>
		Promise.resolve({ default: [widgetsNote] }),
	),
];

/**
 * A fake graph of modules for the specs of `graph.ts` and of whatever reads it, in dependency
 * order: `base`; `addon`, which requires it; `core-ish`, which is always on; `extra`, which requires
 * `addon` and only adds to `side`; and `side`. Its ids are not `ModuleId`s (see `ModuleGraph`).
 */
export const fakeGraph = {
	base: { requires: [], enhances: [], alwaysOn: false },
	addon: { requires: ["base"], enhances: [], alwaysOn: false },
	"core-ish": { requires: [], enhances: [], alwaysOn: true },
	extra: { requires: ["addon"], enhances: ["side"], alwaysOn: false },
	side: { requires: [], enhances: [], alwaysOn: false },
} satisfies ModuleGraph;
