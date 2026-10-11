<!--
	@component
	A material's name linking to its page, with its SKU below.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	let { sku, name }: { sku: string; name: string } = $props();
</script>

<div class="flex max-w-64 flex-col">
	<a
		href={resolve("/(app)/(modules)/materials/[sku]", { sku })}
		class="truncate font-medium underline-offset-4 hover:underline"
	>
		{name}
	</a>
	<span class="truncate text-xs text-muted-foreground">{sku}</span>
</div>
