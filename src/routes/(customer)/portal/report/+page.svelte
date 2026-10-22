<!--
	Report a breakdown ("Storing melden"): the unit (by its site), what's wrong and how urgent it is.
	A unit's QR code leads here with the unit filled in (`?unit=<serial>`), a location's with its
	units to choose from (`?location=<id>`); one the contact doesn't see is a 404. The order it
	makes awaits a planner's acceptance. (No photos: the app has no file storage yet.)
-->
<script lang="ts">
	import { page } from "$app/state";
	import SendIcon from "@lucide/svelte/icons/send";

	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { unitLine, unitTitle } from "#lib/equipment/index.ts";
	import { label } from "#lib/i18n/index.ts";
	import { reportUrgencies } from "#lib/models.ts";
	import { cn } from "#lib/utils.ts";

	import {
		getPortalLocation,
		getPortalSites,
		getPortalUnit,
		reportBreakdown,
	} from "../client.remote.ts";

	const serial = $derived(page.url.searchParams.get("unit"));
	const locationParam = $derived(page.url.searchParams.get("location"));

	// With a scanned unit's or location's: a 404 when it isn't the contact's to see.
	const [sites, unit, place] = $derived(
		await Promise.all([
			getPortalSites(),
			serial ? getPortalUnit(serial) : null,
			locationParam ? getPortalLocation(locationParam) : null,
		]),
	);
	const scanned = $derived(unit ? unit.unit : null);
	const location = $derived(place ? place.location : null);

	const sitesWithUnits = $derived(sites.filter((site) => site.units.length));
	let chosenSite = $derived(
		String(
			scanned?.site.id ?? location?.site.id ?? (sitesWithUnits.length ? sitesWithUnits[0].id : ""),
		),
	);
	const units = $derived(
		(sites.find((site) => String(site.id) === chosenSite)?.units ?? []).filter(
			(unit) => !location || unit.locationId === location.id,
		),
	);
	const unitOptions = $derived(
		units.map((unit) => ({
			value: String(unit.id),
			label: unit.location ? `${unitTitle(unit)} · ${unit.location}` : unitTitle(unit),
		})),
	);

	const urgencyDescription: Record<(typeof reportUrgencies)[number], () => string> = {
		normal: m.client_urgency_normal_description,
		high: m.client_urgency_high_description,
		urgent: m.client_urgency_urgent_description,
	};

	const fields = $derived(reportBreakdown.fields);
</script>

<svelte:head>
	<title>{m.client_report_title()} · {m.client_title()}</title>
</svelte:head>

<!-- A form reads best at a form's width, also on a wide screen. -->
<div class="flex w-full max-w-2xl flex-col gap-6">
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold tracking-tight">{m.client_report_title()}</h1>
		<p class="text-sm text-muted-foreground">{m.client_report_description()}</p>
	</header>

	{#if scanned}
		<Card.Root data-scanned-unit={scanned.serialNumber}>
			<Card.Header>
				<Card.Title>{unitTitle(scanned)}</Card.Title>
				<Card.Description>
					{unitLine(scanned, { site: scanned.site.name, location: scanned.location })}
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if location}
		<p class="text-sm" data-scanned-location={location.id}>
			{m.client_report_at_location({ location: location.name, site: location.site.name })}
		</p>
	{/if}

	{#if sitesWithUnits.length}
		<form {...reportBreakdown} class="flex flex-col gap-6" novalidate>
			{#if scanned}
				<input {...fields.unitId.as("hidden", String(scanned.id))} />
			{:else}
				{#if !location && sitesWithUnits.length > 1}
					<Field.Field>
						<Field.FieldLabel for="report-site">{m.client_report_site()}</Field.FieldLabel>
						<NativeSelect.Root id="report-site" class="w-full" bind:value={chosenSite}>
							{#each sitesWithUnits as site (site.id)}
								<NativeSelect.Option value={String(site.id)}>{site.name}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</Field.Field>
				{/if}
				<SelectField
					field={fields.unitId}
					label={m.client_report_unit()}
					options={unitOptions}
					placeholder={m.client_report_unit_placeholder()}
				/>
			{/if}

			<TextField
				field={fields.description}
				label={m.client_report_what()}
				description={m.client_report_what_description()}
				multiline
			/>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-1 text-sm font-medium">{m.client_report_urgency()}</legend>
				{#each reportUrgencies as urgency (urgency)}
					{@const attributes = fields.urgency.as("radio", urgency)}
					<label
						class={cn(
							"flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent",
							"has-checked:border-primary has-checked:bg-accent",
						)}
					>
						<input
							{...attributes}
							checked={attributes.checked || (urgency === "normal" && !fields.urgency.value())}
							class="mt-1 accent-primary"
						/>
						<span class="flex flex-col">
							<span class="text-sm font-medium">{label("orderPriority", urgency)}</span>
							<span class="text-xs text-muted-foreground">{urgencyDescription[urgency]()}</span>
						</span>
					</label>
				{/each}
				<Field.FieldError errors={fields.urgency.issues()} />
			</fieldset>

			<Field.FieldError errors={fields.issues()} />
			<div>
				<SubmitButton pending={reportBreakdown.pending} icon={SendIcon} size="lg">
					{m.client_report_submit()}
				</SubmitButton>
			</div>
		</form>
	{:else}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Title>{m.client_no_units()}</Empty.Title>
				<Empty.Description>{m.client_no_units_description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>
