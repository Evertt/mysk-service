<script lang="ts">
	import type { CustomerSegment } from "#lib/models.ts";

	import { segments } from "../display.ts";

	let { segment }: { segment: CustomerSegment } = $props();

	const display = $derived(segments[segment]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
