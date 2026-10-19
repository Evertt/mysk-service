<!--
	@component
	The service history of the units ("Activiteitenlog"): of all of them, or of a customer's (by
	code), newest first. Each entry: when, its kind ("soort"), what happened, the units it's about,
	who did it, and the remark or advice that came with it.
-->
<script lang="ts">
	import { getTimeZone } from "#lib/dates.ts";
	import { EquipmentLink } from "#lib/equipment/components.ts";
	import { formatDate } from "#lib/i18n/index.ts";

	import { getServiceHistory } from "../feed.remote.ts";
	import { feedLine } from "../feed.ts";

	let {
		customer,
		limit = 12,
		showCustomer = true,
	}: {
		/** The customer's code; every customer's units without one. */
		customer: string | null;
		limit?: number;
		/** Whether each entry names its customer (not on a customer's own page). */
		showCustomer?: boolean;
	} = $props();

	const data = $derived(await getServiceHistory({ customer, limit }));
	const timeZone = getTimeZone();
</script>

<Card.Root data-service-history>
	<Card.Header>
		<Card.Title>{m.condition_feed_title()}</Card.Title>
		<Card.Description>
			{data.customer
				? m.condition_feed_description_customer({ name: data.customer })
				: m.condition_feed_description()}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if data.entries.length}
			<ol class="flex flex-col divide-y">
				{#each data.entries as entry (entry.key)}
					{@const line = feedLine(entry, timeZone)}
					<li class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0" data-feed-entry={entry.kind}>
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<Badge variant="outline">{line.soort}</Badge>
							<span class="font-medium">{line.text}</span>
							<time
								datetime={entry.at.toString()}
								class="ms-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums"
							>
								{formatDate(entry.at)}
							</time>
						</div>
						<p class="flex flex-wrap gap-x-1 text-sm text-muted-foreground">
							{#each line.units as unit, i (unit.serialNumber)}
								<span>
									<EquipmentLink
										serialNumber={unit.serialNumber}
										class="underline-offset-4 hover:underline">{unit.title}</EquipmentLink
									>{i < line.units.length - 1 ? "," : ""}
								</span>
							{/each}
							{#if entry.kind === "order" && line.detail}
								<span>{line.detail}</span>
							{/if}
							{#if showCustomer}
								<span>· {entry.customer.name}</span>
							{/if}
							{#if entry.by}
								<span>· {m.condition_feed_by({ name: entry.by })}</span>
							{/if}
						</p>
						{#if line.detail && entry.kind !== "order"}
							<p class="text-sm">{line.detail}</p>
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<p class="text-sm text-muted-foreground">{m.condition_feed_empty()}</p>
		{/if}
	</Card.Content>
</Card.Root>
