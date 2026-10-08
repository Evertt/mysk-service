<script lang="ts">
	import type { Snippet } from "svelte";

	let { data, children }: { data: { sampleLayout: string }; children: Snippet } = $props();
</script>

<div class="flex flex-col gap-4 p-6" data-testid="sample-layout">
	<p class="text-sm text-muted-foreground">{m.sample_layout_marker({ id: data.sampleLayout })}</p>
	{@render children()}
</div>
