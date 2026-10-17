<!--
	@component
	What an invoice's issued credit notes took off it (negative, in cents), right-aligned; nothing
	for an invoice without any.
-->
<script lang="ts">
	import { formatCents } from "#lib/i18n/index.ts";

	let { value }: { value: number } = $props();
</script>

<div class="text-right whitespace-nowrap text-muted-foreground tabular-nums">
	{value ? formatCents(value) : ""}
</div>
