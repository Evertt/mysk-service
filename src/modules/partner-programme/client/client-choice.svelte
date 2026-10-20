<!--
	@component
	A closed year's bonus waiting for the partner's own choice in the customer portal: the cash bonus
	or the (larger) parts credit, each with its amount. Choosing asks first, saying it's once and for
	good; credit goes into the wallet, valid until the year's date.
-->
<script lang="ts">
	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";

	import { partnerLabels } from "../labels.ts";
	import type { BonusForm, LevelColour } from "../model.ts";
	import LevelBadge from "../ui/level-badge.svelte";
	import { chooseClientBonus } from "./client-partner.remote.ts";

	interface Awaiting {
		year: number;
		level: string | null;
		colour?: LevelColour;
		cashAmount: number;
		creditAmount: number;
		creditValidUntil: Temporal.PlainDate;
	}

	let { awaiting }: { awaiting: Awaiting } = $props();

	/** Whether the step that asks first is open, and the form it asks about. */
	let confirming = $state(false);
	let choice = $state<BonusForm>("credit");
	const label = $derived(partnerLabels.label("bonusForm", choice));
	const form = $derived(chooseClientBonus.for(String(awaiting.year)));
	const amountOf = (option: BonusForm) =>
		option === "cash" ? awaiting.cashAmount : awaiting.creditAmount;
	const options = $derived((["credit", "cash"] as const).filter((option) => amountOf(option) > 0));
</script>

<Card.Root data-client-choice={awaiting.year}>
	<Card.Header>
		<Card.Title>{m.partners_client_choice_title({ year: String(awaiting.year) })}</Card.Title>
		<Card.Description>{m.partners_client_choice_description()}</Card.Description>
		<Card.Action><LevelBadge level={awaiting.level} colour={awaiting.colour} /></Card.Action>
	</Card.Header>
	<Card.Content class="grid gap-3 sm:grid-cols-2">
		{#each options as option (option)}
			<div class="flex flex-col gap-2 rounded-lg border p-4" data-choice-option={option}>
				<span class="text-sm text-muted-foreground">
					{partnerLabels.label("bonusForm", option)}
				</span>
				<span class="text-2xl font-semibold tabular-nums">{formatCents(amountOf(option))}</span>
				<span class="text-xs text-muted-foreground">
					{option === "credit"
						? m.partners_client_choice_credit({ date: formatDate(awaiting.creditValidUntil) })
						: m.partners_client_choice_cash()}
				</span>
				<Button
					class="mt-auto"
					variant={option === "credit" ? "default" : "outline"}
					onclick={() => {
						choice = option;
						confirming = true;
					}}
				>
					{m.partners_client_choose({ form: partnerLabels.label("bonusForm", option) })}
				</Button>
			</div>
		{/each}
	</Card.Content>
</Card.Root>

<ConfirmDialog
	{form}
	hidden={{ year: String(awaiting.year), choice }}
	title={m.partners_choose_title({ form: label, year: String(awaiting.year) })}
	description={choice === "credit"
		? m.partners_client_confirm_credit({
				amount: formatCents(awaiting.creditAmount),
				date: formatDate(awaiting.creditValidUntil),
			})
		: m.partners_client_confirm_cash({ amount: formatCents(awaiting.cashAmount) })}
	confirmLabel={m.partners_choose_confirm({ form: label })}
	done={m.partners_chosen({ form: label })}
	bind:open={confirming}
/>
