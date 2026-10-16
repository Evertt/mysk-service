<!--
	@component
	The tenant's equipment categories on their settings page, in their order: to add, rename, give
	a specialty, reorder and delete. For owners and admins.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";

	import type { getCategorySettings } from "./categories.remote.ts";
	import CategoryDialog from "./category-dialog.svelte";
	import CategoryRow from "./category-row.svelte";

	let {
		categories,
	}: {
		categories: Awaited<ReturnType<typeof getCategorySettings>>;
	} = $props();

	let adding = $state(false);
</script>

<Card.Root data-testid="equipment-categories">
	<Card.Header>
		<Card.Title>{m.equipment_categories_title()}</Card.Title>
		<Card.Description>{m.equipment_categories_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => (adding = true)}>
				<PlusIcon data-icon="inline-start" />
				{m.equipment_category_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if categories.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.equipment_categories_column_name()}</Table.Head>
						<Table.Head>{m.equipment_categories_column_specialty()}</Table.Head>
						<Table.Head>{m.equipment_categories_column_units()}</Table.Head>
						<Table.Head
							><span class="sr-only">{m.equipment_categories_column_actions()}</span></Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each categories as category, i (category.id)}
						<CategoryRow {category} first={i === 0} last={i === categories.length - 1} />
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<p class="text-sm text-muted-foreground">{m.equipment_categories_empty()}</p>
		{/if}
	</Card.Content>
</Card.Root>

<CategoryDialog bind:open={adding} />
