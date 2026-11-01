/** The wiki's sections, in sidebar order: each page's front-matter names the one it belongs to. */
import BlocksIcon from "@lucide/svelte/icons/blocks";
import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
import CpuIcon from "@lucide/svelte/icons/cpu";
import LayersIcon from "@lucide/svelte/icons/layers";
import RocketIcon from "@lucide/svelte/icons/rocket";
import UsersIcon from "@lucide/svelte/icons/users";
import type { Component } from "svelte";

import { m } from "#lib/paraglide/messages.js";
import type { Locale } from "#lib/paraglide/runtime.js";

export const wikiSections = [
	"start",
	"orders",
	"domains",
	"modules",
	"across",
	"internals",
] as const;

export type WikiSection = (typeof wikiSections)[number];

/**
 * Title and icon per section. The title is a message function, read where it is shown, so it's in
 * the visitor's language (the sidebar, `wikiNav()`), or the `locale` it is given.
 */
export const sectionInfo: Record<
	WikiSection,
	{
		title: (inputs?: Record<string, never>, options?: { locale?: Locale }) => string;
		icon: Component;
	}
> = {
	start: { title: m.wiki_section_start, icon: RocketIcon },
	orders: { title: m.common_nav_orders, icon: ClipboardListIcon },
	domains: { title: m.wiki_section_domains, icon: UsersIcon },
	modules: { title: m.common_nav_modules, icon: BlocksIcon },
	across: { title: m.wiki_section_across, icon: LayersIcon },
	internals: { title: m.wiki_section_internals, icon: CpuIcon },
};
