<!--
	@component
	A link to a unit's detail page, showing its serial number unless `label` or `children` say
	otherwise. `class` replaces the link's own look; `secondary` makes it a table cell's two lines
	(see `RecordLink`). Other attributes go to the anchor.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	let {
		serialNumber,
		label,
		class: className = "font-medium whitespace-nowrap underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children"> & {
		serialNumber: string;
		/** The text shown instead of the serial number, e.g. the unit's name. */
		label?: string;
		secondary?: string | null;
		children?: Snippet;
	} = $props();
</script>

<RecordLink
	{...rest}
	href={resolve("/(app)/equipment/[serial]", { serial: serialNumber })}
	class={className}
>
	{#if children}
		{@render children()}
	{:else}
		{label ?? serialNumber}
	{/if}
</RecordLink>
