<!--
	@component
	A link to a unit's detail page, showing its serial number unless `label` or `children` say
	otherwise. `class` replaces the link's own look; `secondary` makes it a table cell's two lines
	(see `RecordLink`). Other attributes go to the anchor. Resting the pointer on it shows the unit's
	hover card (`EquipmentPreview`), unless `preview={false}`.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	import { getEquipment } from "../equipment.remote.ts";
	import EquipmentPreview from "./equipment-preview.svelte";

	let {
		serialNumber,
		label,
		preview = true,
		class: className = "font-medium whitespace-nowrap underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children" | "class"> & {
		/** The link's classes, instead of its own look. */
		class?: string;
		serialNumber: string;
		/** The text shown instead of the serial number, e.g. the unit's name. */
		label?: string;
		secondary?: string | null;
		/** Whether resting the pointer on it shows the unit's hover card. */
		preview?: boolean;
		children?: Snippet;
	} = $props();
</script>

{#snippet card({ unit, lastService }: Awaited<ReturnType<typeof getEquipment>>)}
	<EquipmentPreview {unit} {lastService} />
{/snippet}

<RecordLink
	{...rest}
	href={resolve("/(app)/equipment/[serial]", { serial: serialNumber })}
	class={className}
	load={() => getEquipment(serialNumber)}
	preview={preview ? card : undefined}
>
	{#if children}
		{@render children()}
	{:else}
		{label ?? serialNumber}
	{/if}
</RecordLink>
