<script lang="ts">
	import { resolve } from "$app/paths";
	import LockIcon from "@lucide/svelte/icons/lock";

	import ChangedElsewhere from "#lib/components/activity/changed-elsewhere.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { isEditableOrder } from "#lib/models.ts";
	import { OrderForm } from "#lib/orders/components.ts";
	import { form as formParts } from "#lib/orders/extensions.ts";
	import { getOrder, getOrderFormOptions, updateOrder } from "#lib/orders/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { order } = $derived(await getOrder(params.number));
	const orderHref = $derived(resolve("/(app)/orders/[number]", { number: order.number }));
	// Counts the reloads of the latest version, which start the form (and its parts) afresh.
	let loaded = $state(0);
</script>

<PageHeader
	title={m.orders_edit_title({ number: order.number })}
	description={order.customer.name}
	breadcrumbs={[
		{ label: m.orders_title(), href: resolve("/(app)/orders") },
		{ label: order.number, href: orderHref },
		{ label: m.common_edit() },
	]}
/>

<ChangedElsewhere type="order" id={order.id} onreload={() => loaded++} />

{#if isEditableOrder(order.status)}
	{#key loaded}
		<OrderForm
			form={updateOrder}
			{order}
			options={await getOrderFormOptions()}
			cancelHref={orderHref}
		>
			{#snippet parts(fields)}
				<ExtensionSlot point={formParts} props={{ order: { id: order.id } }} {fields} />
			{/snippet}
		</OrderForm>
	{/key}
{:else}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon">
				<LockIcon />
			</Empty.Media>
			<Empty.Title>{m.orders_invoiced_title({ number: order.number })}</Empty.Title>
			<Empty.Description>{m.orders_invoiced_description()}</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={orderHref}>{m.orders_back_to_order()}</Button>
		</Empty.Content>
	</Empty.Root>
{/if}
