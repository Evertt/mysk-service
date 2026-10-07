<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import PageHeader from "#lib/components/page-header.svelte";

	import InvoicesTable from "./invoices-table.svelte";
	import { getInvoices } from "./invoices.remote.js";
</script>

<svelte:head>
	<title>Invoices</title>
</svelte:head>

<PageHeader
	title="Invoices"
	description="Bills for completed orders and other fees, from draft to paid."
>
	{#snippet actions()}
		<Button variant="outline" href={resolve("/(app)/invoices/settings")}>
			<SettingsIcon data-icon="inline-start" />
			Settings
		</Button>
		<Button href={resolve("/(app)/invoices/new")}>
			<PlusIcon data-icon="inline-start" />
			New invoice
		</Button>
	{/snippet}
</PageHeader>

<InvoicesTable invoices={await getInvoices()} />
