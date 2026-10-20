<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import PrinterIcon from "@lucide/svelte/icons/printer";

	import PrintSheet from "#lib/components/print-sheet.svelte";
	import { getWorkOrder } from "#modules/checklists/checklists.remote.ts";
	import WorkOrder from "#modules/checklists/detail/work-order.svelte";

	let { params }: { params: RouteParams<"/(app)/(modules)/checklists/work-orders/[number]"> } =
		$props();

	const data = $derived(await getWorkOrder(params.number));
</script>

<svelte:head>
	<title>{m.checklists_work_order_title({ number: data.order.number })}</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-2 print:hidden">
	<Button
		variant="ghost"
		size="sm"
		class="-ml-2"
		href={resolve("/(app)/orders/[number]", { number: data.order.number })}
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
