<!--
	@component
	What one of an order's costs is made of (an `OrderCostItem`, e.g. a material), by its label,
	linking to the record it is, with its detail (e.g. the SKU) below.
-->
<script lang="ts">
	import { subjectHref } from "#lib/activity/index.ts";

	import type { OrderCostItem } from "../extensions.ts";

	let { item }: { item: Pick<OrderCostItem, "label" | "detail" | "subject"> } = $props();

	const href = $derived(item.subject && subjectHref(item.subject.type, item.subject));
</script>

<div class="flex max-w-64 flex-col">
	{#if href}
		<a {href} class="truncate font-medium underline-offset-4 hover:underline">
			{item.label}
		</a>
	{:else}
		<span class="truncate font-medium">{item.label}</span>
	{/if}
	{#if item.detail}
		<span class="truncate text-xs text-muted-foreground">{item.detail}</span>
	{/if}
</div>
