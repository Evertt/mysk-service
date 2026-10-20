<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";
	import { addProgrammeYear, getProgrammeYears } from "#modules/partner-programme/years.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/partner-programme/settings"> } = $props();

	const data = $derived(await getProgrammeYears());
</script>

<PageHeader
	title={m.partners_years_title()}
	description={m.partners_years_description()}
	breadcrumbs={[
		{ label: m.partners_title(), href: resolve("/(app)/(modules)/partner-programme") },
		{ label: m.partners_years_title() },
	]}
>
	{#snippet actions()}
		{#if data.canManage}
			<form {...addProgrammeYear}>
				<input {...addProgrammeYear.fields.year.as("hidden", String(data.next))} />
				<SubmitButton icon={PlusIcon} pending={addProgrammeYear.pending}>
					{m.partners_year_add({ year: String(data.next) })}
				</SubmitButton>
			</form>
		{/if}
	{/snippet}
</PageHeader>

<Card.Root class="max-w-2xl">
	<Card.Content>
		{#if data.years.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.partners_column_year()}</Table.Head>
						<Table.Head>{m.partners_column_levels()}</Table.Head>
						<Table.Head class="text-right"
							><span class="sr-only">{m.partners_years_close()}</span></Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.years as each (each.year)}
						<Table.Row>
							<Table.Cell>
								<a
									class="font-medium underline-offset-4 hover:underline"
									href={resolve("/(app)/(modules)/partner-programme/settings/[year]", {
										year: String(each.year),
									})}
								>
									{each.year}
								</a>
							</Table.Cell>
							<Table.Cell class="tabular-nums">{formatNumber(each.levels)}</Table.Cell>
							<Table.Cell class="text-right">
								{#if each.year < data.current}
									<Button
										variant="outline"
										size="sm"
										href={resolve("/(app)/(modules)/partner-programme/settings/[year]/close", {
											year: String(each.year),
										})}
									>
										{m.partners_years_close()}
									</Button>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.partners_years_empty()}</Empty.Title>
					<Empty.Description>{m.partners_years_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
