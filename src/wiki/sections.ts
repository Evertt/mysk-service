/** The wiki's sections, in sidebar order: each page's front-matter names the one it belongs to. */
import BlocksIcon from "@lucide/svelte/icons/blocks";
import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
import CpuIcon from "@lucide/svelte/icons/cpu";
import LayersIcon from "@lucide/svelte/icons/layers";
import RocketIcon from "@lucide/svelte/icons/rocket";
import UsersIcon from "@lucide/svelte/icons/users";
import type { Component } from "svelte";

export const wikiSections = [
	"start",
	"orders",
	"domains",
	"modules",
	"across",
	"internals",
] as const;

export type WikiSection = (typeof wikiSections)[number];

/** Title and icon per section. */
export const sectionInfo: Record<WikiSection, { title: string; icon: Component }> = {
	start: { title: "Start", icon: RocketIcon },
	orders: { title: "Orders", icon: ClipboardListIcon },
	domains: { title: "Customers, equipment and engineers", icon: UsersIcon },
	modules: { title: "Modules", icon: BlocksIcon },
	across: { title: "Across the app", icon: LayersIcon },
	internals: { title: "Under the hood", icon: CpuIcon },
};
