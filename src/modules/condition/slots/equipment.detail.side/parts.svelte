<!--
	@component
	The condition module's card of a unit's components on its page (`equipment.detail.side`,
	`#lib/equipment/extensions.ts`): each component with its article, its condition, status and
	advice, in their order; adding, editing, removing and ordering them, and recording a component's
	condition as a correction.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { getUnitComponents } from "../../components.remote.ts";
	import ComponentDialog from "../../detail/component-dialog.svelte";
	import ComponentRow from "../../detail/component-row.svelte";
	import RecordDialog from "../../detail/record-dialog.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getUnitComponents(serialNumber));

	/** The component being edited (its id), a new one (`new`), or none. */
	let editing = $state<number | "new" | null>(null);
	/** The component whose condition is being recorded (its id), or none. */
	let recording = $state<number | null>(null);
	const edited = $derived(
		typeof editing === "number"
			? (data.components.find((part) => part.id === editing) ?? null)
			: null,
	);
	const recorded = $derived(data.components.find((part) => part.id === recording) ?? null);
</script>

<Card.Root data-unit-components>
	<Card.Header>
		<Card.Title>{m.condition_components_title()}</Card.Title>
		<Card.Description>{m.condition_components_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => (editing = "new")}>
				<PlusIcon data-icon="inline-start" />
				{m.condition_component_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if data.components.length}
			<ul class="flex flex-col divide-y">
				{#each data.components as part, i (part.id)}
					<ComponentRow
						{part}
						first={i === 0}
						last={i === data.components.length - 1}
						onedit={() => (editing = part.id)}
						onrecord={() => (recording = part.id)}
					/>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">{m.condition_components_none()}</p>
		{/if}
	</Card.Content>
</Card.Root>

{#if editing !== null}
	{#key editing}
		<ComponentDialog
			bind:open={() => editing !== null, (open) => !open && (editing = null)}
			unit={data.unit}
			editing={edited}
			articles={data.articles}
			articleCheckpoints={data.articleCheckpoints}
			checkpoints={data.checkpoints}
			hasArticles={data.has.materials}
		/>
	{/key}
{/if}

{#if recorded}
	<RecordDialog
		bind:open={() => recording !== null, (open) => !open && (recording = null)}
		unit={data.unit}
		component={recorded}
		score={recorded.score}
	/>
{/if}
