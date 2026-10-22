<!--
	@component
	The materials' part of the order form: the order's material lines, submitted with the order under
	`modules.materials` (as `form-parts/orders.form.ts` says, which validates them in the browser and
	on the server) and saved with it (`saveOrderMaterials()`, through `orders.saving`).
-->
<script lang="ts">
	import type { FormPartFields } from "#lib/extensions/define.ts";

	import type part from "../../form-parts/orders.form.ts";
	import OrderLinesField from "../../orders/order-lines-field.svelte";
	import { getMaterialOptions, getOrderLines } from "../../orders/order-lines.remote.ts";

	let {
		fields,
		order,
	}: { fields: FormPartFields<typeof part>; order: { id: number } | undefined } = $props();

	const [materials, quoted] = $derived(
		await Promise.all([getMaterialOptions(), order ? getOrderLines(order.id) : undefined]),
	);
</script>

<OrderLinesField field={fields.lines} {materials} {quoted} />
