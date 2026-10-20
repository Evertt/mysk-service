<!--
	@component
	The materials card on an engineer's page of one of their orders (`portal.order`): what they used,
	which they can change while the job is in progress.
-->
<script lang="ts">
	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";

	import { formatQuantity } from "../../display.ts";
	import FieldMaterialsForm from "../../portal/field-materials-form.svelte";
	import { getFieldMaterials } from "../../portal/field-materials.remote.ts";

	let { number, id }: { number: string; id: number } = $props();

	const data = $derived(await getFieldMaterials(number));
	// The order's lines saved, here or by the office.
	refreshOnRecordChange(
		() => ({ type: "order", id }),
		() => getFieldMaterials(number).refresh(),
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.materials_portal_title()}</Card.Title>
		<Card.Description>
			{data.canChange ? m.materials_portal_work() : m.materials_portal_done()}
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
			<p class="text-sm text-muted-foreground">{m.materials_portal_none()}</p>
		{/if}
	</Card.Content>
</Card.Root>
