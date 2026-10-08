<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import PageHeader from "#lib/components/page-header.svelte";

	import InvoicesTable from "./invoices-table.svelte";
	import { getInvoices } from "./invoices.remote.js";
</script>

<svelte:head>
	<title>{m.invoices_title()}</title>
</svelte:head>

<PageHeader title={m.invoices_title()} description={m.invoices_description()}>
	{#snippet actions()}
		<Button variant="outline" href={resolve("/(app)/invoices/settings")}>
			<SettingsIcon data-icon="inline-start" />
			{m.invoices_settings()}
		</Button>
		<Button href={resolve("/(app)/invoices/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.invoices_new()}
		</Button>
	{/snippet}
</PageHeader>

<InvoicesTable invoices={await getInvoices()} />
