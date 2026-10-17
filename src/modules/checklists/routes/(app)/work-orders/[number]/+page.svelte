<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import PrinterIcon from "@lucide/svelte/icons/printer";

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

<div
	class="mx-auto w-full max-w-[210mm] rounded-lg border bg-card p-6 print:max-w-none print:border-0 print:p-0"
>
	<WorkOrder {data} />
</div>

<style>
	/* A4, and only the work order: the app's sidebar, header and notices stay off the paper. */
	@media print {
		@page {
			size: A4;
			margin: 14mm;
		}
		:global([data-slot="sidebar"]),
		:global([data-slot="app-header"]),
		:global([data-sonner-toaster]) {
			display: none !important;
		}
		:global([data-slot="sidebar-wrapper"]),
		:global([data-slot="sidebar-inset"]) {
			display: block !important;
			min-height: 0 !important;
			margin: 0 !important;
			border: 0 !important;
			box-shadow: none !important;
			background: white !important;
		}
		:global(body) {
			background: white !important;
		}
	}
</style>
