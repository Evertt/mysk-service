<!--
	@component
	The checklists module's card on a unit of equipment's page (`equipment.detail.side`,
	`#lib/equipment/extensions.ts`): the template the unit is inspected by, through its category,
	with its norm and how long an inspection stays valid, or that its category has none.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import DetailItem from "#lib/components/detail-item.svelte";

	import { getUnitTemplate } from "../../templates.remote.ts";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getUnitTemplate(serialNumber));
</script>

<Card.Root data-checklist-template>
	<Card.Header>
		<Card.Title>{m.checklists_card_title()}</Card.Title>
		<Card.Description>
			{data.template
				? m.checklists_card_description({ category: data.category })
				: m.checklists_card_none({ category: data.category })}
		</Card.Description>
	</Card.Header>
	{#if data.template}
		<Card.Content>
			<dl class="grid gap-4">
				<DetailItem
					label={m.checklists_field_template()}
					value={data.template.name}
					href={resolve("/(app)/(modules)/checklists/settings/[id]", {
						id: String(data.template.id),
					})}
				/>
				<DetailItem label={m.checklists_field_norm()} value={data.template.norm} />
				<DetailItem
					label={m.checklists_field_validity()}
					value={m.checklists_months({ count: data.template.validityMonths })}
				/>
			</dl>
		</Card.Content>
	{/if}
</Card.Root>
