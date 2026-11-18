<!--
	A done order's work order (werkbon) in the customer portal, to print: the same as the office's,
	with only the customer's units at the contact's sites. The app bar leads back to the order and
	prints it; on paper only the work order.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PrinterIcon from "@lucide/svelte/icons/printer";

	import AppBar from "#lib/client/app-bar.svelte";
	import PrintSheet from "#lib/components/print-sheet.svelte";
	import { getClientWorkOrder } from "#modules/checklists/client/client-checklists.remote.ts";
	import WorkOrder from "#modules/checklists/detail/work-order.svelte";

	let {
		params,
	}: { params: RouteParams<"/(customer)/(modules)/checklists/portal/work-orders/[number]"> } =
		$props();

	const data = $derived(await getClientWorkOrder(params.number));
</script>

<AppBar
	title={m.checklists_work_order_title({ number: data.order.number })}
	back={{
		href: resolve("/(customer)/portal/orders/[number]", { number: data.order.number }),
		label: data.order.number,
	}}
>
	{#snippet actions()}
		<Button
			variant="ghost"
			size="icon"
			onclick={() => window.print()}
			aria-label={m.checklists_print()}
		>
			<PrinterIcon class="size-5" />
		</Button>
	{/snippet}
</AppBar>

<PrintSheet class="rounded-xl p-4">
	<WorkOrder {data} heading="h2" />
</PrintSheet>
