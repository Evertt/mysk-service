<!--
	@component
	Checklist templates in a table: each one's name (to its page), norm, how long an inspection by
	it stays valid, the categories it's for and how many points it has.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatNumber } from "#lib/i18n/index.ts";

	import type { getTemplates } from "../templates.remote.ts";

	let {
		templates,
	}: {
		templates: Awaited<ReturnType<typeof getTemplates>>["templates"];
	} = $props();
</script>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>{m.checklists_column_name()}</Table.Head>
			<Table.Head>{m.checklists_column_norm()}</Table.Head>
			<Table.Head>{m.checklists_column_validity()}</Table.Head>
			<Table.Head>{m.checklists_column_categories()}</Table.Head>
			<Table.Head class="text-right">{m.checklists_column_points()}</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each templates as template (template.id)}
			<Table.Row data-template={template.name}>
				<Table.Cell class="font-medium">
					<a
						class="hover:underline"
						href={resolve("/(app)/(modules)/checklists/settings/[id]", {
							id: String(template.id),
						})}>{template.name}</a
					>
				</Table.Cell>
				<Table.Cell>{template.norm ?? "—"}</Table.Cell>
				<Table.Cell class="tabular-nums">
					{m.checklists_months({ count: template.validityMonths })}
				</Table.Cell>
				<Table.Cell class="whitespace-normal">
					{#if template.categories.length}
						<div class="flex flex-wrap gap-1">
							{#each template.categories as category (category.id)}
								<Badge variant="outline">{category.name}</Badge>
							{/each}
						</div>
					{:else}
						<span class="text-muted-foreground">—</span>
					{/if}
				</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatNumber(template.pointCount)}</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
