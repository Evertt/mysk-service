<!--
	A done order's work order (werkbon) in the customer portal, to print: the same as the office's,
	with only the customer's units at the contact's sites.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import PrinterIcon from "@lucide/svelte/icons/printer";

	import PrintSheet from "#lib/components/print-sheet.svelte";
	import { getClientWorkOrder } from "#modules/checklists/client/client-checklists.remote.ts";
	import WorkOrder from "#modules/checklists/detail/work-order.svelte";

	let {
		params,
	}: { params: RouteParams<"/(customer)/(modules)/checklists/portal/work-orders/[number]"> } =
		$props();

	const data = $derived(await getClientWorkOrder(params.number));
</script>

<svelte:head>
	<title>{m.checklists_work_order_title({ number: data.order.number })}</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-2 print:hidden">
	<Button
		variant="ghost"
		size="sm"
		class="-ml-2"
		href={resolve("/(customer)/portal/orders/[number]", { number: data.order.number })}
	>
		<ArrowLeftIcon data-icon="inline-start" />
		{data.order.number}
	</Button>
	<Button onclick={() => window.print()}>
		<PrinterIcon data-icon="inline-start" />
		{m.checklists_print()}
	</Button>
</div>

<PrintSheet>
	<WorkOrder {data} />
</PrintSheet>
