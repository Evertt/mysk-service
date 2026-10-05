<!--
	@component
	Right-aligned number of open orders; muted when there are none.
-->
<script lang="ts">
	import { cn } from "#lib/utils.js";

	let { count }: { count: number } = $props();
</script>

<div class={cn("text-right tabular-nums", !count && "text-muted-foreground")}>{count}</div>
