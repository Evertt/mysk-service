<!--
	@component
	Records a partner's choice for a closed year, after asking: it can't be undone. Credit goes into
	the wallet, cash is the amount to pay out.
-->
<script lang="ts">
	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import { formatCents } from "#lib/i18n/index.ts";

	import { partnerLabels } from "../labels.ts";
	import type { BonusForm } from "../model.ts";
	import { choosePartnerBonus } from "../partners.remote.ts";

	let {
		code,
		year,
		choice,
		amount,
	}: { code: string; year: number; choice: BonusForm; amount: number } = $props();

	const form = $derived(choosePartnerBonus.for(`${code}:${year}:${choice}`));
	const label = $derived(partnerLabels.label("bonusForm", choice));
</script>

<ConfirmDialog
	{form}
	hidden={{ code, year: String(year), choice }}
	title={m.partners_choose_title({ form: label, year: String(year) })}
	description={choice === "credit"
		? m.partners_choose_credit_description({ amount: formatCents(amount) })
		: m.partners_choose_cash_description({ amount: formatCents(amount) })}
	confirmLabel={m.partners_choose_confirm({ form: label })}
	done={m.partners_chosen({ form: label })}
>
	{#snippet trigger(props)}
		<Button {...props} size="sm" variant={choice === "credit" ? "default" : "outline"}>
			{m.partners_choose({ form: label, amount: formatCents(amount) })}
		</Button>
	{/snippet}
</ConfirmDialog>
