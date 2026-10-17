<!--
	@component
	The partner programme's part of the order form: which revenue category the order's revenue is, and
	how it counts for the bonus (in full, partly, for the level only or not at all), each left at the
	default unless the office says otherwise. Submitted under `modules.partnerProgramme` (`formPartKey()`) (as
	`form-parts/orders.form.ts` says) and saved with the order (`orders.saving`).
-->
<script lang="ts">
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import type { FormPartFields } from "#lib/extensions/define.ts";

	import { getOrderClassification } from "../../classification.remote.ts";
	import type part from "../../form-parts/orders.form.ts";
	import { partnerLabels } from "../../labels.ts";
	import { eligibilities, revenueCategories } from "../../model.ts";

	let {
		fields,
		order,
	}: { fields: FormPartFields<typeof part>; order: { id: number } | undefined } = $props();

	const saved = $derived(order ? await getOrderClassification(order.id) : undefined);
	let eligibility = $derived<string>(saved?.eligibility ?? "");

	const categoryOptions = $derived([
		{
			value: "",
			label: saved
				? m.partners_default_category({
						category: partnerLabels.label("revenueCategory", saved.defaultCategory),
					})
				: m.partners_default_by_type(),
		},
		...partnerLabels.labelOptions("revenueCategory", revenueCategories),
	]);
	const eligibilityOptions = $derived([
		{ value: "", label: m.partners_default_eligibility() },
		...partnerLabels.labelOptions("eligibility", eligibilities),
	]);
</script>

<Card.Root data-partner-classification>
	<Card.Header>
		<Card.Title>{m.partners_module_name()}</Card.Title>
		<Card.Description>{m.partners_classification_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Field.FieldGroup class="grid gap-6 md:grid-cols-3">
			<SelectField
				field={fields.category}
				label={m.partners_field_category()}
				options={categoryOptions}
				value={saved?.category ?? ""}
			/>
			<SelectField
				field={fields.eligibility}
				label={m.partners_field_eligibility()}
				options={eligibilityOptions}
				value={saved?.eligibility ?? ""}
				onchange={(value) => (eligibility = value)}
			/>
			{#if eligibility === "partial"}
				<NumberField
					field={fields.share}
					label={m.partners_field_share_percent()}
					min={1}
					max={99}
					step={1}
					value={saved?.share}
				/>
			{/if}
		</Field.FieldGroup>
	</Card.Content>
</Card.Root>
