<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import CustomersTable from "./customers-table.svelte";
	import { getCustomers } from "./customers.remote.js";
</script>

<svelte:head>
	<title>Customers</title>
</svelte:head>

<PageHeader title="Customers" description="Companies whose equipment we install and service.">
	{#snippet actions()}
		<Button href={resolve("/(app)/customers/new")}>
			<PlusIcon data-icon="inline-start" />
			New customer
		</Button>
	{/snippet}
</PageHeader>

<CustomersTable customers={await getCustomers()} />
