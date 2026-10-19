<!--
	@component
	Sets up one order type for the tenant: its own name in each language (empty for the standard
	one), and whether the order form leaves it out. The server refuses hiding a type something
	needs, or the last one shown.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { label, languageNames, standardLabel } from "#lib/i18n/index.ts";
	import type { OrderType } from "#lib/models.ts";
	import { locales } from "#lib/paraglide/runtime.js";

	import { saveOrderType } from "./type-settings.remote.ts";

	let {
		setting,
		open = $bindable(false),
	}: {
		setting: {
			type: OrderType;
			names: Partial<Record<string, string>>;
			hidden: boolean;
			requiredBy: string[];
		};
		open?: boolean;
	} = $props();

	const form = $derived(saveOrderType.for(setting.type));
	const fields = $derived(form.fields);
	const name = $derived(label("orderType", setting.type));
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.orders_types_edit_title({ name })}</Dialog.Title>
			<Dialog.Description>{m.orders_types_dialog_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (!(await submitted(submit))) return;
				open = false;
				toast.success(m.orders_types_saved());
			})}
			class="flex flex-col gap-6"
		>
			<input {...fields.type.as("hidden", setting.type)} />
			<Field.FieldGroup>
				{#each locales as locale (locale)}
					{@const standard = standardLabel("orderType", setting.type, locale)}
					<TextField
						field={fields.names[locale]}
						label={languageNames[locale]}
						value={setting.names[locale]}
						placeholder={standard}
						autocomplete="off"
						description={m.orders_types_field_standard({ name: standard })}
					/>
				{/each}
				<CheckboxField
					field={fields.hidden}
					label={m.orders_types_field_hidden()}
					checked={setting.hidden}
					description={setting.requiredBy.length
						? m.orders_types_needed_by({ needs: setting.requiredBy.join(", ") })
						: m.orders_types_field_hidden_description()}
				/>
			</Field.FieldGroup>

			<Field.FieldError errors={fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.common_save()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
