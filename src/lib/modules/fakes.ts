/**
 * Made-up modules for the specs of the core, which test its extension points (slots, bulk actions,
 * activity subjects and verbs) without the real modules in `src/modules`: a spec mocks the
 * registry with them, `vi.mock("#lib/modules/manifests.gen.ts", async () => ({ manifests: fakeModules }))`,
 * or passes them where a function takes a registry. What a real module does is tested in its own
 * folder.
 */
import type { Component } from "svelte";

import type { Sentence } from "#lib/activity";
import type { ModuleGraph } from "#lib/modules/graph.ts";
import type { AppModule, ModuleId } from "#lib/modules/manifests.ts";

const loader = () => Promise.resolve({ default: {} as Component });
const sentence =
	(verb: string): Sentence =>
	(inputs) =>
		`${inputs.user} ${verb} ${inputs.subject}`;

/** A module with slots, bulk actions, activity subjects and a verb. */
export const widgets = {
	id: "widgets" as ModuleId,
	label: "Widgets",
	description: "Makes widgets",
	route: "/(app)/orders",
	icon: {} as Component,
	slots: { dashboard: loader, order: loader },
	bulkActions: { orders: () => Promise.resolve({ default: [] }) },
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
	},
	actions: { approved: sentence("approved") },
} satisfies AppModule;

/** A module that only has a slot on the dashboard and one on a unit of equipment's page. */
export const gadgets = {
	id: "gadgets" as ModuleId,
	label: "Gadgets",
	description: "Makes gadgets",
	route: "/(app)/orders",
	icon: {} as Component,
	slots: { dashboard: loader, equipment: loader },
} satisfies AppModule;

/**
 * A module whose slot on an order's page never loads, like a chunk that fails to download. Not in
 * `fakeModules`: a spec that renders slots adds it where it needs a failing one.
 */
export const gizmos = {
	id: "gizmos" as ModuleId,
	label: "Gizmos",
	description: "Makes gizmos",
	route: "/(app)/orders",
	icon: {} as Component,
	slots: { order: () => Promise.reject(new Error("Failed to fetch dynamically imported module")) },
} satisfies AppModule;

/** The fake registry, in registry order. */
export const fakeModules = [gadgets, widgets] as const;

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
