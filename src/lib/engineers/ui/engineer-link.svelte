<!--
	@component
	An engineer's name linking to their page, unless `children` say otherwise. `class` replaces the
	link's own look; `secondary` makes it a table cell's two lines (see `RecordLink`). Other
	attributes go to the anchor. Resting the pointer on it shows the engineer's hover card
	(`EngineerPreview`), unless `preview={false}`.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	import { getEngineer } from "../engineers.remote.ts";
	import EngineerPreview from "./engineer-preview.svelte";

	let {
		id,
		name,
		preview = true,
		class: className = "font-medium underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children" | "id"> & {
		id: number;
		name: string;
		secondary?: string | null;
		/** Whether resting the pointer on it shows the engineer's hover card. */
		preview?: boolean;
		children?: Snippet;
	} = $props();
</script>

{#snippet card(record: Awaited<ReturnType<typeof getEngineer>>)}
	<EngineerPreview {...record} />
{/snippet}

<!-- The card asks by the id as the engineer's page's URL has it, so the two share one answer. -->
<RecordLink
	{...rest}
	href={resolve("/(app)/engineers/[id]", { id: String(id) })}
	class={className}
	load={() => getEngineer(String(id))}
	preview={preview ? card : undefined}
>
	{#if children}
		{@render children()}
	{:else}
		{name}
	{/if}
</RecordLink>
