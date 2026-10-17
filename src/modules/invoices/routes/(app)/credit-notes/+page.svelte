<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";
	import { getCreditNotes } from "#modules/invoices/credit-notes.remote.ts";
	import CreditNotesTable from "#modules/invoices/list/credit-notes-table.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/invoices/credit-notes"> } = $props();
</script>

<svelte:head>
	<title>{m.invoices_credit_notes()} · {m.invoices_title()}</title>
</svelte:head>

<PageHeader
	title={m.invoices_credit_notes()}
	description={m.invoices_credit_notes_description()}
	breadcrumbs={[
		{ label: m.invoices_title(), href: resolve("/(app)/(modules)/invoices") },
		{ label: m.invoices_credit_notes() },
	]}
>
	{#snippet actions()}
		<Button href={resolve("/(app)/(modules)/invoices/credit-notes/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.invoices_credit_new()}
		</Button>
	{/snippet}
</PageHeader>

<CreditNotesTable creditNotes={await getCreditNotes()} />
