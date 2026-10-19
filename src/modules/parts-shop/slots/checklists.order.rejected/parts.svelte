<!--
	@component
	The parts shop under an order's checklists in the office (`checklists.order.rejected`): the part
	each rejected point needs ("Benodigd onderdeel"), the products linked to the point, with their
	stock and a way to add one to the order as a material line. Nothing when no product fixes them.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import { formatCents } from "#lib/i18n/index.ts";
	import type { RejectedPoint } from "#modules/checklists/api/extensions.ts";

	import { addSuggestedPart, getSuggestedParts } from "../../suggestions/suggested-parts.remote.ts";
	import StockBadge from "../../ui/stock-badge.svelte";

	let { number, rejected }: { number: string; rejected: RejectedPoint[] } = $props();

	const ids = $derived(
		[...new Set(rejected.map((point) => point.templateItemId))].sort((a, b) => a - b),
	);
	/** The articles the points check (their components'), suggested first. */
	const articles = $derived(
		[...new Set(rejected.flatMap((point) => point.materialId ?? []))].sort((a, b) => a - b),
	);
	const data = $derived(await getSuggestedParts({ number, ids, articles }));
	const parts = $derived(data.parts);
</script>

{#if parts.length}
	<Card.Root data-suggested-parts>
		<Card.Header>
			<Card.Title>{m.shop_suggested_title()}</Card.Title>
			<Card.Description>{m.shop_suggested_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col divide-y">
			{#each parts as part (part.id)}
				{@const form = addSuggestedPart.for(`${number}:${part.id}`)}
				{@const points = rejected.filter(
					(point) =>
						point.materialId === part.materialId || part.points.includes(point.templateItemId),
				)}
				<article
					class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
					data-suggested-part={part.sku}
				>
					<div class="flex items-start justify-between gap-2">
						<div class="flex min-w-0 flex-col">
							<span class="font-medium">{part.name}</span>
							<span class="text-xs text-muted-foreground">
								{part.sku} · {formatCents(part.price)}
							</span>
						</div>
						<StockBadge availability={part.availability} />
					</div>
					<ul class="flex flex-col gap-0.5 text-xs text-muted-foreground">
						{#each points as point, i (i)}
							<li>{point.unit}: {point.text}</li>
						{/each}
					</ul>
					{#if data.canAdd}
						<form
							{...form.enhance(async ({ submit }) => {
								// The order and the modules' cards are the server's to refresh; this card's stock too.
								if (
									await submitted(() =>
										submit().updates(getSuggestedParts({ number, ids, articles })),
									)
								)
									toast.success(m.shop_suggested_added({ name: part.name, number }));
							})}
						>
							<input {...form.fields.number.as("hidden", number)} />
							<input {...form.fields.productId.as("hidden", String(part.id))} />
							<SubmitButton size="sm" variant="outline" icon={PlusIcon} pending={form.pending}>
								{m.shop_suggested_add()}
							</SubmitButton>
							<Field.FieldError errors={form.fields.allIssues()} class="mt-2" />
						</form>
					{/if}
				</article>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
