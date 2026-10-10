/**
 * Where the modules' entries go in the sidebar (`src/routes/(app)/app-sidebar.svelte`). A module's
 * manifest may say `nav: { after: "<id>" }`, naming a core entry (`coreNavIds`) or another module;
 * without it, its entry is in the sidebar's Modules group. Pure and isomorphic.
 */
import type { Component } from "svelte";

/** The ids of the sidebar's core entries, which a module's `nav.after` may name. */
const coreNavIds = [
	"dashboard",
	"orders",
	"activity",
	"customers",
	"equipment",
	"engineers",
	"materials",
] as const;

export type CoreNavId = (typeof coreNavIds)[number];

/** An entry in the sidebar: a core section's (`id` one of `coreNavIds`) or a module's (its id). */
export interface NavItem {
	id: string;
	title: string;
	href: string;
	icon: Component;
}

/** A group of entries in the sidebar, under a label. */
export interface NavGroup {
	label: string;
	items: NavItem[];
}

/**
 * The sidebar's groups with the tenant's modules (`modules`, in registry order) placed in them:
 * each module with `after` right after that entry, behind the modules already placed after it (so
 * several after one entry keep registry order); a module may go after another module, whichever
 * comes first in registry order. The rest, without `after` or after an entry that isn't shown (a
 * module that's off), go in a last group labelled `modulesLabel`. Empty groups are left out, and
 * `groups` is left as it was.
 */
export function placeNav(
	groups: NavGroup[],
	modules: (NavItem & { after?: string })[],
	modulesLabel: string,
): NavGroup[] {
	const placed = groups.map((group) => ({ ...group, items: [...group.items] }));
	/** Where each module placed so far went, so the next one after the same entry goes behind it. */
	const lastAfter = new Map<string, string>();
	let waiting = modules.filter((module) => module.after !== undefined);
	for (let progress = true; progress;) {
		progress = false;
		for (const module of waiting) {
			const after = module.after!;
			const anchor = lastAfter.get(after) ?? after;
			const group = placed.find((g) => g.items.some((entry) => entry.id === anchor));
			if (!group) continue;
			const index = group.items.findIndex((entry) => entry.id === anchor);
			const { after: _, ...entry } = module;
			group.items.splice(index + 1, 0, entry);
			lastAfter.set(after, module.id);
			waiting = waiting.filter((other) => other !== module);
			progress = true;
		}
	}
	const rest = modules
		.filter((module) => module.after === undefined || waiting.includes(module))
		.map(({ after: _, ...entry }) => entry);
	return [...placed, { label: modulesLabel, items: rest }].filter((group) => group.items.length);
}
