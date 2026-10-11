<!--
	@component
	The materials' part of the order form: the order's material lines, submitted with the order under
	`modules.materials` and saved with it (`saveOrderMaterials()`, through `orders.saving`).
-->
<script lang="ts">
	import type { RemoteFormFields } from "$app/server";
	import type * as v from "valibot";

	import type { materialsPart } from "#lib/materials/index.ts";
	import type { ModuleFormFields } from "#lib/orders/extensions.ts";

	import OrderLinesField from "../../orders/order-lines-field.svelte";
	import { getMaterialOptions, getOrderLines } from "../../orders/order-lines.remote.ts";

	let { fields, order }: { fields: ModuleFormFields; order: { id: number } | undefined } = $props();

	// The materials' part of the form, which the module knows the shape of.
	const part = $derived(
		fields.materials as unknown as RemoteFormFields<v.InferInput<typeof materialsPart>>,
	);
	const materials = $derived(await getMaterialOptions());
	const quoted = $derived(order ? await getOrderLines(order.id) : undefined);
</script>

<OrderLinesField field={part.lines} {materials} {quoted} />
