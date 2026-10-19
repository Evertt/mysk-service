<!--
	@component
	A link to a record's page, as the record link components render it (`OrderLink`, `CustomerLink`,
	`EquipmentLink`, `EngineerLink`): `children` inside an anchor with `class`. With `secondary` (a
	string, or `null` for none), it's a table cell's two lines: the link, and a muted line below it
	(`TwoLineCell`'s layout).
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import TwoLineCell from "../data-table/two-line-cell.svelte";

	let {
		href,
		class: className,
		secondary,
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "class" | "children"> & {
		href: string;
		/** The anchor's classes (in two lines, the cell's own). */
		class: string;
		/** A line below the link, as in a table cell; `null` for the layout without one. */
		secondary?: string | null;
		children: Snippet;
	} = $props();
</script>

{#snippet anchor(anchorClass: string)}
	<a {...rest} {href} class={anchorClass}>{@render children()}</a>
{/snippet}

{#if secondary !== undefined}
	<TwoLineCell {secondary} link={anchor} />
{:else}
	{@render anchor(className)}
{/if}
