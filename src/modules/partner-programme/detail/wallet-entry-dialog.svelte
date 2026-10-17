<!--
	@component
	Adds an entry to a partner's wallet by hand: credit spent outside the shop, or credit added, with
	what it's for and, added, until when it's valid.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	import MoneyField from "#lib/components/form/money-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { addWalletEntry } from "../partners.remote.ts";

	let { code, validUntil }: { code: string; validUntil: Temporal.PlainDate | null } = $props();

	let open = $state(false);
	const form = $derived(addWalletEntry.for(code));
	const kindOptions = $derived([
		{ value: "spend", label: m.partners_wallet_option_spend() },
		{ value: "adjustment", label: m.partners_wallet_option_add() },
	]);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm">
				<PlusIcon data-icon="inline-start" />
				{m.partners_wallet_add()}
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.partners_wallet_add_title()}</Dialog.Title>
			<Dialog.Description>{m.partners_wallet_add_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submit()) {
					open = false;
					toast.success(m.partners_wallet_added());
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.code.as("hidden", code)} />
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
			<Field.FieldError errors={form.fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.partners_wallet_add()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
