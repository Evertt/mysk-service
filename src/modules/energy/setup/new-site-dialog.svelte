<!--
	@component
	Adds energy monitoring to a customer site: the site (given, from the customer's page, or chosen
	from those without it), its contract, panels, tariff, CO₂ factor and time zone. Saved, it opens
	the site's setup page, where its zones, consumers and doors are added.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";

	import { createEnergySite, getEnergySiteChoices } from "../sites.remote.ts";
	import SiteFields from "./site-fields.svelte";

	let {
		site,
		label = m.energy_setup_add_site(),
	}: {
		/** The customer site it's for; one to choose without. */
		site?: { id: number; name: string; customer: string };
		/** The button's text. */
		label?: string;
	} = $props();

	const form = $derived(createEnergySite.for(site ? `site-${site.id}` : "new"));
	const choices = $derived(site ? [] : await getEnergySiteChoices());
	const options = $derived(
		choices.map((each) => ({
			value: String(each.id),
			label: each.name === each.city ? each.name : `${each.name}, ${each.city}`,
			group: each.customer,
		})),
	);
	let chosen = $state<string>();
	const picked = $derived(site ?? choices.find((each) => String(each.id) === chosen));
	const defaultName = $derived(picked ? `${picked.customer} — ${picked.name}` : undefined);
</script>

<!-- Saved, the server opens the site's setup page. -->
<FormDialog
	{form}
	title={m.energy_setup_add_site()}
	submitLabel={m.energy_setup_add_site()}
	description={site ? `${site.customer} · ${site.name}` : m.energy_setup_add_site_description()}
	class="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
>
	{#snippet trigger(props)}
		<Button {...props} variant="outline" size="sm" data-energy-add-site={site?.id ?? true}>
			<PlusIcon data-icon="inline-start" />
			{label}
		</Button>
	{/snippet}
	<Field.FieldGroup>
		{#if site}
			<input {...form.fields.siteId.as("hidden", String(site.id))} />
		{:else}
			<SelectField
				field={form.fields.siteId}
				label={m.energy_setup_site()}
				{options}
				placeholder={options.length ? m.energy_setup_site_choose() : m.energy_setup_no_sites()}
				onchange={(value) => (chosen = value)}
			/>
		{/if}
		<SiteFields fields={form.fields} {defaultName} />
	</Field.FieldGroup>
</FormDialog>
