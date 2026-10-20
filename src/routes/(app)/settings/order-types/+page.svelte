<!--
	@component
	The order types as the organization sets them up: its own names and the hidden ones. Owners and
	admins keep them: anyone else gets a 403 from `getOrderTypeSetup`.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { OrderTypesCard } from "#lib/orders/components.ts";
	import { getOrderTypeSetup } from "#lib/orders/remotes.ts";

	const types = $derived(await getOrderTypeSetup());
</script>

<PageHeader
	title={m.orders_types_title()}
	description={m.orders_types_description()}
	breadcrumbs={[
		{ label: m.common_organization_settings(), href: resolve("/(app)/settings") },
		{ label: m.orders_types_title() },
	]}
/>

<div class="max-w-4xl">
	<OrderTypesCard {types} />
</div>
