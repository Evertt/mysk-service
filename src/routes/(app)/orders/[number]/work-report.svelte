<!--
	@component
	What the engineer recorded on an order in the field: the customer's sign-off and work notes.
	Nothing while there's neither.
-->
<script lang="ts">
	import { formatDateTime } from "#lib/i18n";

	import { getWorkReport } from "./work-report.remote.ts";

	let { number }: { number: string } = $props();

	const report = $derived(await getWorkReport(number));
</script>

{#if report.signoff || report.notes.length}
	<Card.Root data-slot="work-report">
		<Card.Header>
			<Card.Title>{m.orders_report_title()}</Card.Title>
			<Card.Description>{m.orders_report_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if report.signoff}
				<div class="flex flex-col gap-2">
					<dl class="grid grid-cols-2 gap-4">
						<div class="flex flex-col gap-0.5">
							<dt class="text-xs text-muted-foreground">{m.orders_report_signed_off_by()}</dt>
							<dd class="text-sm">{report.signoff.signerName}</dd>
						</div>
						<div class="flex flex-col gap-0.5">
							<dt class="text-xs text-muted-foreground">{m.orders_report_signed()}</dt>
							<dd class="text-sm tabular-nums">{formatDateTime(report.signoff.signedAt)}</dd>
						</div>
					</dl>
					<img
						src={report.signoff.signature}
						alt={m.orders_report_signature({ name: report.signoff.signerName })}
						class="h-28 w-full rounded-lg border bg-white object-contain"
					/>
					{#if report.signoff.collectedBy}
						<span class="text-xs text-muted-foreground">
							{m.orders_report_collected_by({ name: report.signoff.collectedBy })}
						</span>
					{/if}
				</div>
			{/if}
			{#each report.notes as note (note.id)}
				<div class="flex flex-col gap-1 rounded-lg bg-muted p-3">
					<p class="text-sm whitespace-pre-line">{note.text}</p>
					<span class="text-xs text-muted-foreground">
						{note.author ?? m.orders_report_someone()} · {formatDateTime(note.createdAt)}
					</span>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
