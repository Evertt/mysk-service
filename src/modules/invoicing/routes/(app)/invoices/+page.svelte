<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import PageHeader from "#lib/components/page-header.svelte";

	import InvoicesTable from "./invoices-table.svelte";
	import { getInvoices } from "./invoices.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/invoices"> } = $props();
</script>

<svelte:head>
	<title>{m.invoices_title()}</title>
</svelte:head>

<PageHeader title={m.invoices_title()} description={m.invoices_description()}>
	{#snippet actions()}
		<Button variant="outline" href={resolve("/(app)/(modules)/invoices/settings")}>
			<SettingsIcon data-icon="inline-start" />
			{m.invoices_settings()}
		</Button>
		<Button href={resolve("/(app)/(modules)/invoices/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.invoices_new()}
		</Button>
	{/snippet}
</PageHeader>

<InvoicesTable invoices={await getInvoices()} />
