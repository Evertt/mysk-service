<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { canManage } from "#lib/auth/can-manage.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import TemplateDialog from "#modules/checklists/form/template-dialog.svelte";
	import TemplatesTable from "#modules/checklists/list/templates-table.svelte";
	import { getTemplates } from "#modules/checklists/templates.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/checklists/settings"> } = $props();

	const [data, manager] = $derived(await Promise.all([getTemplates(), canManage()]));
	const active = $derived(data.templates.filter((template) => !template.archived));
	const retired = $derived(data.templates.filter((template) => template.archived));
	let adding = $state(false);
</script>

<PageHeader
	title={m.checklists_templates_title()}
	description={m.checklists_templates_description()}
	breadcrumbs={[
		{ label: m.checklists_module_name(), href: resolve("/(app)/(modules)/checklists") },
		{ label: m.checklists_templates_title() },
	]}
>
	{#snippet actions()}
		{#if manager}
			<Button onclick={() => (adding = true)}>
				<PlusIcon data-icon="inline-start" />
				{m.checklists_add_template()}
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-6">
	{#if data.uncovered.length}
		<Card.Root data-checklist-gaps>
			<Card.Header>
				<Card.Title>{m.checklists_gaps_title()}</Card.Title>
				<Card.Description>
					{m.checklists_gaps_description()}
					{#if !manager}{m.checklists_managers_change_these()}{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-wrap gap-2">
					{#each data.uncovered as category (category.id)}
						<Badge variant="outline">{category.name}</Badge>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root data-checklist-templates>
		<Card.Content>
			{#if active.length}
				<TemplatesTable templates={active} />
			{:else}
				<Empty.Root class="p-6">
					<Empty.Header>
						<Empty.Title>{m.checklists_empty_title()}</Empty.Title>
						<Empty.Description>{m.checklists_empty_description()}</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if retired.length}
		<Card.Root data-checklist-retired>
			<Card.Header>
				<Card.Title>{m.checklists_retired_title()}</Card.Title>
				<Card.Description>{m.checklists_retired_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<TemplatesTable templates={retired} />
			</Card.Content>
		</Card.Root>
	{/if}
</div>

{#if manager}
	<TemplateDialog bind:open={adding} />
{/if}
