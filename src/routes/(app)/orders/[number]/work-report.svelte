<!--
	@component
	What the engineer recorded on an order in the field: the customer's sign-off and work notes.
	Nothing while there's neither.
-->
<script lang="ts">
	import { formatDate } from "#lib/format.js";

	import { getWorkReport } from "./work-report.remote.js";

	let { number }: { number: string } = $props();

	const report = $derived(await getWorkReport(number));

	const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
	const formatMoment = (date: Date) => `${formatDate(date)} ${time.format(date)}`;
</script>

{#if report.signoff || report.notes.length}
	<Card.Root data-slot="work-report">
		<Card.Header>
			<Card.Title>Field report</Card.Title>
			<Card.Description>Recorded by the engineer on site.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if report.signoff}
				<div class="flex flex-col gap-2">
					<dl class="grid grid-cols-2 gap-4">
						<div class="flex flex-col gap-0.5">
							<dt class="text-xs text-muted-foreground">Signed off by</dt>
							<dd class="text-sm">{report.signoff.signerName}</dd>
						</div>
						<div class="flex flex-col gap-0.5">
							<dt class="text-xs text-muted-foreground">Signed</dt>
							<dd class="text-sm tabular-nums">{formatMoment(report.signoff.signedAt)}</dd>
						</div>
					</dl>
					<img
						src={report.signoff.signature}
						alt="Signature of {report.signoff.signerName}"
						class="h-28 w-full rounded-lg border bg-white object-contain"
					/>
					{#if report.signoff.collectedBy}
						<span class="text-xs text-muted-foreground">
							Collected by {report.signoff.collectedBy}
						</span>
					{/if}
				</div>
			{/if}
			{#each report.notes as note (note.id)}
				<div class="flex flex-col gap-1 rounded-lg bg-muted p-3">
					<p class="text-sm whitespace-pre-line">{note.text}</p>
					<span class="text-xs text-muted-foreground">
						{note.author ?? "Someone"} · {formatMoment(note.createdAt)}
					</span>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
