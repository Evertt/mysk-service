<!--
	@component
	What the calendar's colours stand for: each order type with its swatch, icon and label.
-->
<script lang="ts">
	import { orderTypes } from "#lib/models.ts";
	import { orderTypeDisplay } from "#lib/orders/index.ts";
	import { cn } from "#lib/utils.ts";

	import { typeColors } from "./type-colors.ts";
</script>

<ul
	aria-label={m.schedule_legend()}
	class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
>
	{#each orderTypes as type (type)}
		{@const display = orderTypeDisplay[type]}
		<li class="flex items-center gap-1.5" data-type={type}>
			<span class={cn("size-2.5 rounded-full", typeColors[type].swatch)} aria-hidden="true"></span>
			<display.icon class="size-3.5" aria-hidden="true" />
			{display.label}
		</li>
	{/each}
</ul>
