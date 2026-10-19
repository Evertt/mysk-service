<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDateTime, formatTimeAgo } from "#lib/i18n/format.ts";

	import { getBugReports } from "./bug-reports.remote.ts";

	const reports = $derived(await getBugReports());
	const now = Temporal.Now.instant();
</script>

<svelte:head>
	<title>{m.bugs_list_title()}</title>
</svelte:head>

<PageHeader title={m.bugs_list_title()} description={m.bugs_list_description()} />

{#if reports.length === 0}
	<p class="text-sm text-muted-foreground">{m.bugs_list_empty()}</p>
{:else}
	<div class="overflow-x-auto rounded-lg border">
		<Table.Root data-slot="bug-reports">
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.bugs_column_reported()}</Table.Head>
					<Table.Head>{m.bugs_column_organization()}</Table.Head>
					<Table.Head>{m.bugs_column_user()}</Table.Head>
					<Table.Head>{m.bugs_column_note()}</Table.Head>
					<Table.Head>{m.bugs_column_page()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each reports as report (report.id)}
					<Table.Row>
						<Table.Cell class="whitespace-nowrap">
							<a
								href={resolve("/(ops)/ops/bug-reports/[id]", { id: report.id })}
								class="font-medium underline-offset-4 hover:underline"
								title={formatDateTime(report.createdAt)}
							>
								{formatTimeAgo(report.createdAt, now)}
							</a>
						</Table.Cell>
						<Table.Cell>{report.organization}</Table.Cell>
						<Table.Cell>{report.userName}</Table.Cell>
						<Table.Cell class="max-w-md truncate" title={report.note}>{report.note}</Table.Cell>
						<Table.Cell class="max-w-xs truncate text-muted-foreground" title={report.url}>
							{report.path}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}
