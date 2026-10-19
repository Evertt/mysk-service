<!--
	@component
	A link to an order's page, showing its number unless `children` say otherwise. `class` replaces
	the link's own look; `secondary` makes it a table cell's two lines (see `RecordLink`). Other
	attributes go to the anchor.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	let {
		number,
		class: className = "font-medium whitespace-nowrap underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children"> & {
		number: string;
		secondary?: string | null;
		children?: Snippet;
	} = $props();
</script>

<RecordLink {...rest} href={resolve("/(app)/orders/[number]", { number })} class={className}>
	{#if children}
		{@render children()}
	{:else}
		{number}
	{/if}
</RecordLink>
