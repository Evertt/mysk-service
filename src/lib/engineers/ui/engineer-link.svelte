<!--
	@component
	An engineer's name linking to their page, unless `children` say otherwise. `class` replaces the
	link's own look; `secondary` makes it a table cell's two lines (see `RecordLink`). Other
	attributes go to the anchor.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	let {
		id,
		name,
		class: className = "font-medium underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children" | "id"> & {
		id: number;
		name: string;
		secondary?: string | null;
		children?: Snippet;
	} = $props();
</script>

<RecordLink {...rest} href={resolve("/(app)/engineers/[id]", { id: String(id) })} class={className}>
	{#if children}
		{@render children()}
	{:else}
		{name}
	{/if}
</RecordLink>
