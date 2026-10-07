<!--
	@component
	The badges the tenant's modules put on an order (see `OrderTag` in `#lib/modules.ts`), e.g. a
	response time about to be missed.
-->
<script lang="ts">
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import type { OrderTag } from "#lib/modules.js";

	let { tags }: { tags: OrderTag[] } = $props();

	const tones = {
		warning: { variant: "secondary", icon: CircleAlertIcon },
		danger: { variant: "destructive", icon: TriangleAlertIcon },
	} as const;
</script>

{#each tags as tag, i (i)}
	{@const tone = tones[tag.tone]}
	<Badge variant={tone.variant} title={tag.detail}>
		<tone.icon data-icon="inline-start" />
		{tag.label}
	</Badge>
{/each}
