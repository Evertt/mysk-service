<script lang="ts">
	import type { OrderType } from "#lib/models.js";

	import { types } from "./display.js";

	let { type }: { type: OrderType } = $props();

	const display = $derived(types[type]);
</script>

<span class="inline-flex items-center gap-1.5 whitespace-nowrap">
	<display.icon class="size-4 text-muted-foreground" />
	{display.label}
</span>
