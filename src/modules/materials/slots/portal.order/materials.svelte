<!--
	@component
	The materials card on an engineer's page of one of their orders (`portal.order`): what they used,
	which they can change while the job is in progress.
-->
<script lang="ts">
	import { formatQuantity } from "#lib/materials/index.ts";

	import FieldMaterialsForm from "../../portal/field-materials-form.svelte";
	import { getFieldMaterials } from "../../portal/field-materials.remote.ts";

	let { number }: { number: string } = $props();

	const data = $derived(await getFieldMaterials(number));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_materials()}</Card.Title>
		<Card.Description>
			{data.canChange ? m.portal_materials_work() : m.portal_materials_done()}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if data.canChange}
			<FieldMaterialsForm orderId={data.orderId} lines={data.lines} />
		{:else if data.lines.length}
			<ul class="flex flex-col divide-y">
				{#each data.lines as line (line.id)}
					<li class="flex justify-between gap-4 py-2">
						<span>{line.name}</span>
						<span class="text-muted-foreground tabular-nums">
							{formatQuantity(line.quantity, line.unit)}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">{m.portal_no_materials()}</p>
		{/if}
	</Card.Content>
</Card.Root>
