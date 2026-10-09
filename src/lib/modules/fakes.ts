/**
 * Made-up modules for the specs of the core, which test its extension points (slots, bulk actions,
 * activity subjects and verbs) without the real modules in `src/modules`: a spec mocks the
 * registry with them, `vi.mock("#lib/modules/manifests.gen.ts", async () => ({ manifests: fakeModules }))`,
 * or passes them where a function takes a registry. What a real module does is tested in its own
 * folder.
 */
import type { Component } from "svelte";

import type { Sentence } from "#lib/activity/subjects.ts";
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

/** The fake registry, in registry order. */
export const fakeModules = [gadgets, widgets] as const;
