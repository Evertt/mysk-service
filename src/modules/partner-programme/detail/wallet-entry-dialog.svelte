<!--
	@component
	Adds an entry to a partner's wallet by hand: credit spent outside the shop, or credit added, with
	what it's for and, added, until when it's valid.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import MoneyField from "#lib/components/form/money-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { addWalletEntry } from "../partners.remote.ts";

	let { code, validUntil }: { code: string; validUntil: Temporal.PlainDate | null } = $props();

	const form = $derived(addWalletEntry.for(code));
	const kindOptions = $derived([
		{ value: "spend", label: m.partners_wallet_option_spend() },
		{ value: "adjustment", label: m.partners_wallet_option_add() },
	]);
</script>

<FormDialog
	{form}
	title={m.partners_wallet_add_title()}
	description={m.partners_wallet_add_description()}
	submitLabel={m.partners_wallet_add()}
	hidden={{ code }}
	done={m.partners_wallet_added()}
	class="sm:max-w-md"
>
	{#snippet trigger(props)}
		<Button {...props} variant="outline" size="sm">
			<PlusIcon data-icon="inline-start" />
			{m.partners_wallet_add()}
		</Button>
	{/snippet}
	<Field.FieldGroup>
		<SelectField
			field={form.fields.kind}
			label={m.partners_field_kind()}
			options={kindOptions}
			value="spend"
		/>
		<MoneyField field={form.fields.amount} label={m.partners_field_amount()} />
		<TextField field={form.fields.note} label={m.partners_field_note()} />
		<TextField
			field={form.fields.validUntil}
			label={m.partners_wallet_valid_until()}
			description={m.partners_wallet_valid_until_description()}
			type="date"
			value={validUntil?.toString() ?? ""}
		/>
	</Field.FieldGroup>
</FormDialog>
