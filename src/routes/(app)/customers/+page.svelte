<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";
	import { CustomersTable } from "#lib/customers/components.ts";
	import { getCustomers } from "#lib/customers/remotes.ts";
</script>

<PageHeader title={m.customers_title()} description={m.customers_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/customers/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.customers_new()}
		</Button>
	{/snippet}
</PageHeader>

<CustomersTable customers={await getCustomers()} />
