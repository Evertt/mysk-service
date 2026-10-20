<!--
	@component
	The engineer an order is assigned to, on its page: their name (linked to their page), region,
	specialty, rate and how to reach them, or that nobody is assigned yet.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { EngineerLink } from "#lib/engineers/components.ts";
	import { engineerSpecialtyDisplay } from "#lib/engineers/index.ts";
	import { formatCents } from "#lib/i18n/index.ts";

	import type { getOrder } from "../order.remote.ts";

	let {
		engineer,
	}: {
		engineer: Awaited<ReturnType<typeof getOrder>>["order"]["engineer"];
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.orders_engineer()}</Card.Title>
		{#if engineer}
			<Card.Description>{m.orders_engineer_region({ region: engineer.region })}</Card.Description>
			<Card.Action>
				<EnumBadge display={engineerSpecialtyDisplay} value={engineer.specialty} />
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if engineer}
			<dl class="grid grid-cols-2 gap-4">
				<DetailItem label={m.orders_detail_name()}>
					<EngineerLink
						id={engineer.id}
						name={engineer.name}
						class="underline-offset-4 hover:underline"
					/>
				</DetailItem>
				<DetailItem
					label={m.orders_detail_hourly_rate()}
					value={formatCents(engineer.hourlyRate)}
				/>
				<DetailItem
					label={m.orders_detail_email()}
					value={engineer.email}
					href={`mailto:${engineer.email}`}
				/>
				<DetailItem
					label={m.orders_detail_phone()}
					value={engineer.phone}
					href={`tel:${engineer.phone}`}
				/>
			</dl>
		{:else}
			<p class="text-sm text-muted-foreground">{m.orders_no_engineer()}</p>
		{/if}
	</Card.Content>
</Card.Root>
