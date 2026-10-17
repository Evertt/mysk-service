<!--
	@component
	A product's stock as the shop shows it: "Op voorraad", "Laag voorraad" or "Op aanvraag".
-->
<script lang="ts">
	import type { BadgeTone } from "#lib/components/ui/badge/index.ts";

	import { shopLabels } from "../labels.ts";
	import type { ProductStock } from "../model.ts";

	let { availability }: { availability: ProductStock } = $props();

	const tones: Record<ProductStock, BadgeTone> = {
		in_stock: "success",
		low: "warning",
		on_request: "neutral",
	};
</script>

<Badge variant={tones[availability]} data-stock={availability}>
	{shopLabels.label("productStock", availability)}
</Badge>
