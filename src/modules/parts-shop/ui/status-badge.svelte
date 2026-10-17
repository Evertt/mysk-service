<!--
	@component
	A shop order's status as a badge, coloured by what it means: placed and confirmed still to do,
	shipped on its way, delivered done, cancelled out of the picture.
-->
<script lang="ts">
	import type { BadgeTone } from "#lib/components/ui/badge/index.ts";

	import { shopLabels } from "../labels.ts";
	import type { ShopOrderStatus } from "../model.ts";

	let { status }: { status: ShopOrderStatus } = $props();

	const tones: Record<ShopOrderStatus, BadgeTone> = {
		placed: "warning",
		confirmed: "info",
		shipped: "info",
		delivered: "success",
		cancelled: "neutral",
	};
</script>

<Badge variant={tones[status]} data-shop-status={status}>
	{shopLabels.label("shopOrderStatus", status)}
</Badge>
