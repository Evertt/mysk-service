<!--
	@component
	An equipment category with its icon.
-->
<script lang="ts">
	import type { EquipmentCategory } from "#lib/models.ts";

	import { categories } from "../display.ts";

	let { category }: { category: EquipmentCategory } = $props();

	const display = $derived(categories[category]);
</script>

<span class="inline-flex items-center gap-1.5 whitespace-nowrap">
	<display.icon class="size-4 text-muted-foreground" />
	{display.label}
</span>
