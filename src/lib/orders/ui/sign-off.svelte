<!--
	@component
	An order's sign-off, as the office and both portals show it: who signed off for the customer and
	when, then the customer's and the engineer's signatures side by side (stacked where the card is
	narrow: on a phone, in the office's side column), and
	who in the office collected it when the sign-off says (the office's).
-->
<script lang="ts">
	import { formatDateTime } from "#lib/i18n/index.ts";

	let {
		signoff,
	}: {
		signoff: {
			signerName: string;
			signature: string;
			engineerName: string | null;
			engineerSignature: string | null;
			signedAt: Temporal.Instant;
			/** Who in the office collected it, for the office only. */
			collectedBy?: string | null;
		};
	} = $props();

	const signatures = $derived([
		{ key: "customer", name: signoff.signerName, image: signoff.signature },
		// The engineer's own, on sign-offs since engineers sign too.
		...(signoff.engineerName && signoff.engineerSignature
			? [{ key: "engineer", name: signoff.engineerName, image: signoff.engineerSignature }]
			: []),
	]);
</script>

<div class="@container flex flex-col gap-4" data-signoff>
	<p class="text-sm">
		{m.orders_signoff_signed({
			name: signoff.signerName,
			date: formatDateTime(signoff.signedAt),
		})}
	</p>
	<div class="grid gap-4 @sm:grid-cols-2">
		{#each signatures as signature (signature.key)}
			<figure class="flex flex-col gap-2" data-signature={signature.key}>
				<img
					src={signature.image}
					alt={m.orders_report_signature({ name: signature.name })}
					class="h-24 w-full rounded-md border bg-white object-contain"
				/>
				<figcaption class="text-sm">
					{signature.key === "customer"
						? m.orders_signoff_customer({ name: signature.name })
						: m.orders_signoff_engineer({ name: signature.name })}
				</figcaption>
			</figure>
		{/each}
	</div>
	{#if signoff.collectedBy}
		<p class="text-xs text-muted-foreground">
			{m.orders_report_collected_by({ name: signoff.collectedBy })}
		</p>
	{/if}
</div>
