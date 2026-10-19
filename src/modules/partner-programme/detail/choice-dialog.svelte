<!--
	@component
	Records a partner's choice for a closed year, after asking: it can't be undone. Credit goes into
	the wallet, cash is the amount to pay out.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
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

	let open = $state(false);
	const form = $derived(choosePartnerBonus.for(`${code}:${year}:${choice}`));
	const label = $derived(partnerLabels.label("bonusForm", choice));
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} size="sm" variant={choice === "credit" ? "default" : "outline"}>
				{m.partners_choose({ form: label, amount: formatCents(amount) })}
			</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title
				>{m.partners_choose_title({ form: label, year: String(year) })}</AlertDialog.Title
			>
			<AlertDialog.Description>
				{choice === "credit"
					? m.partners_choose_credit_description({ amount: formatCents(amount) })
					: m.partners_choose_cash_description({ amount: formatCents(amount) })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submitted(submit)) {
					open = false;
					toast.success(m.partners_chosen({ form: label }));
				}
			})}
		>
			<input {...form.fields.code.as("hidden", code)} />
			<input {...form.fields.year.as("hidden", String(year))} />
			<input {...form.fields.choice.as("hidden", choice)} />
			<Field.FieldError errors={form.fields.allIssues()} class="mb-4" />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
				<SubmitButton pending={form.pending}
					>{m.partners_choose_confirm({ form: label })}</SubmitButton
				>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
