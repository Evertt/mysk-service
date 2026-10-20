<!--
	@component
	A link to a shop order's page in the office, showing its number unless `children` say otherwise.
	`class` replaces the link's own look; `secondary` makes it a table cell's two lines (see
	`RecordLink`). Other attributes go to the anchor. Resting the pointer on it shows the order's
	hover card (`ShopOrderPreview`), unless `preview={false}`.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	import { getShopOrder } from "../orders.remote.ts";
	import ShopOrderPreview from "./shop-order-preview.svelte";

	let {
		number,
		preview = true,
		class: className = "font-medium whitespace-nowrap underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children" | "class"> & {
		/** The link's classes, instead of its own look. */
		class?: string;
		number: string;
		secondary?: string | null;
		/** Whether resting the pointer on it shows the order's hover card. */
		preview?: boolean;
		children?: Snippet;
	} = $props();
</script>

{#snippet card(order: Awaited<ReturnType<typeof getShopOrder>>)}
	<ShopOrderPreview {order} />
{/snippet}

<RecordLink
	{...rest}
	href={resolve("/(app)/(modules)/parts-shop/orders/[number]", { number })}
	class={className}
	load={() => getShopOrder(number)}
	preview={preview ? card : undefined}
>
	{#if children}
		{@render children()}
	{:else}
		{number}
	{/if}
</RecordLink>
