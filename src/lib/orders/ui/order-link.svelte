<!--
	@component
	A link to an order's page, showing its number unless `children` say otherwise. `class` replaces
	the link's own look; `secondary` makes it a table cell's two lines (see `RecordLink`). Other
	attributes go to the anchor. Resting the pointer on it shows the order's hover card
	(`OrderPreview`), unless `preview={false}`.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	import { getOrder } from "../order.remote.ts";
	import OrderPreview from "./order-preview.svelte";

	let {
		number,
		preview = true,
		class: className = "font-medium whitespace-nowrap underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children"> & {
		number: string;
		secondary?: string | null;
		/** Whether resting the pointer on it shows the order's hover card. */
		preview?: boolean;
		children?: Snippet;
	} = $props();
</script>

{#snippet card({ order, sites }: Awaited<ReturnType<typeof getOrder>>)}
	<OrderPreview {order} {sites} />
{/snippet}

<RecordLink
	{...rest}
	href={resolve("/(app)/orders/[number]", { number })}
	class={className}
	load={() => getOrder(number)}
	preview={preview ? card : undefined}
>
	{#if children}
		{@render children()}
	{:else}
		{number}
	{/if}
</RecordLink>
